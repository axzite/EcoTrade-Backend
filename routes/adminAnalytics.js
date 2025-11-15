// routes/adminAnalytics.js
import express from "express";
import Order from "../models/orderModel.js";
import Food from "../models/foodModel.js";
import User from "../models/userModel.js";

const router = express.Router();

/**
 * GET /api/admin/overview
 * Query params:
 *   - start=YYYY-MM-DD (optional)
 *   - end=YYYY-MM-DD (optional)
 *
 * Returns:
 *  totalSales, totalOrders, totalProducts, totalUsers,
 *  activeUsersLast30 (adapted to window), salesOverTime, salesByCategory, topProducts, conversionRate
 */
router.get("/overview", async (req, res) => {
  try {
    // parse optional start/end from query: ?start=2025-10-01&end=2025-10-30
    const now = new Date();
    let { start, end } = req.query;
    let startDate = null;
    let endDate = null;

    if (start) {
      const sd = new Date(start);
      if (!isNaN(sd)) startDate = sd;
    }
    if (end) {
      const ed = new Date(end);
      if (!isNaN(ed)) {
        ed.setHours(23, 59, 59, 999); // include whole day
        endDate = ed;
      }
    }

    // fallback to last 30 days if none provided
    if (!startDate && !endDate) {
      endDate = now;
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 30);
    } else if (startDate && !endDate) {
      endDate = now;
    } else if (!startDate && endDate) {
      startDate = new Date(endDate);
      startDate.setDate(endDate.getDate() - 30);
    }

    // 1) Basic totals (global, not limited by range)
    const [totalOrders, totalProducts, totalUsers] = await Promise.all([
      Order.countDocuments({}),
      Food.countDocuments({}),
      User.countDocuments({}),
    ]);

    // 2) Total Sales (global) - sum of orders with payment true
    const salesAgg = await Order.aggregate([
      { $match: { payment: true } },
      { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);
    const totalSales = (salesAgg[0] && salesAgg[0].total) || 0;

    // 3) Active users in selected window (users who placed orders in range)
    const activeUsersAgg = await Order.aggregate([
      { $match: { date: { $gte: startDate, $lte: endDate } } },
      { $group: { _id: "$userId" } },
      { $count: "activeUsers" }
    ]);
    const activeUsersWindow = (activeUsersAgg[0] && activeUsersAgg[0].activeUsers) || 0;

    // 4) Sales over time (daily totals for selected window)
    const salesOverTime = await Order.aggregate([
      { $match: { payment: true, date: { $gte: startDate, $lte: endDate } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
          total: { $sum: "$amount" },
          orders: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // 5) Expand items to compute category revenue and top products within the window
    const itemsUnwind = await Order.aggregate([
      { $match: { payment: true, date: { $gte: startDate, $lte: endDate } } },
      { $unwind: "$items" },
      {
        $addFields: {
          "items.foodId": {
            $cond: [
              { $ifNull: ["$items.foodId", false] },
              "$items.foodId",
              { $ifNull: ["$items._id", "$items.id"] }
            ]
          },
          "items.qty": { $ifNull: ["$items.qty", 1] },
          "items.price": { $ifNull: ["$items.price", "$items.amount", 0] }
        }
      },
      {
        $addFields: {
          "items.foodObjId": {
            $cond: [
              { $and: [{ $ifNull: ["$items.foodId", false] }, { $ne: ["$items.foodId", ""] }] },
              {
                $let: {
                  vars: { maybeId: "$items.foodId" },
                  in: {
                    $cond: [
                      { $isArray: ["$$maybeId"] },
                      null,
                      { $convert: { input: "$$maybeId", to: "objectId", onError: null, onNull: null } }
                    ]
                  }
                }
              },
              null
            ]
          }
        }
      },
      {
        $lookup: {
          from: "foods",
          localField: "items.foodObjId",
          foreignField: "_id",
          as: "foodDoc"
        }
      },
      { $unwind: { path: "$foodDoc", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          "items.qty": 1,
          "items.price": 1,
          "items.foodId": 1,
          foodName: { $ifNull: ["$foodDoc.name", "$items.name", "Unknown Product"] },
          category: { $ifNull: ["$foodDoc.category", "$items.category", "Uncategorized"] }
        }
      }
    ]);

    // compute sales by category & top products
    const salesByCategoryMap = {};
    const topProductsMap = {};

    itemsUnwind.forEach(it => {
      const cat = it.category || "Uncategorized";
      const qty = it.items?.qty || 1;
      const price = it.items?.price || 0;
      const revenue = qty * price;

      if (!salesByCategoryMap[cat]) salesByCategoryMap[cat] = { revenue: 0, qty: 0 };
      salesByCategoryMap[cat].revenue += revenue;
      salesByCategoryMap[cat].qty += qty;

      const name = it.foodName || "Unknown Product";
      if (!topProductsMap[name]) topProductsMap[name] = { qty: 0, revenue: 0 };
      topProductsMap[name].qty += qty;
      topProductsMap[name].revenue += revenue;
    });

    const salesByCategory = Object.entries(salesByCategoryMap).map(([name, d]) => ({
      name,
      revenue: d.revenue,
      qty: d.qty
    }));

    const topProducts = Object.entries(topProductsMap)
      .map(([name, d]) => ({ name, qty: d.qty, revenue: d.revenue }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 20);

    // conversion rate heuristic (global)
    const conversionRate = totalUsers > 0 ? (totalOrders / totalUsers) * 100 : 0;

    return res.json({
      success: true,
      data: {
        totalSales,
        totalOrders,
        totalProducts,
        totalUsers,
        activeUsersWindow,
        salesOverTime,
        salesByCategory,
        topProducts,
        conversionRate: Number(conversionRate.toFixed(2)),
        range: { start: startDate ? startDate.toISOString().slice(0,10) : null, end: endDate ? endDate.toISOString().slice(0,10) : null }
      }
    });
  } catch (err) {
    console.error("analytics error:", err);
    return res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
});

export default router;
