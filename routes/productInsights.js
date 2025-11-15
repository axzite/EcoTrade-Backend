// routes/productInsights.js
import express from "express";
import Order from "../models/orderModel.js";
import Food from "../models/foodModel.js";
import User from "../models/userModel.js";
import mongoose from "mongoose";

const router = express.Router();

/**
 * GET /api/admin/product-insights
 * Query params:
 *  - start=YYYY-MM-DD (optional)
 *  - end=YYYY-MM-DD (optional)
 *  - category=CategoryName (optional)
 *  - productId=... (optional) -> if present returns product-detail object
 *  - page, limit (optional) for listing
 */
router.get("/", async (req, res) => {
  try {
    const now = new Date();
    let { start, end, category, productId, page = 1, limit = 20 } = req.query;
    page = parseInt(page) || 1;
    limit = parseInt(limit) || 20;

    let startDate = null, endDate = null;
    if (start) {
      const sd = new Date(start);
      if (!isNaN(sd)) startDate = sd;
    }
    if (end) {
      const ed = new Date(end);
      if (!isNaN(ed)) { ed.setHours(23,59,59,999); endDate = ed; }
    }
    if (!startDate && !endDate) {
      endDate = now;
      startDate = new Date(now); startDate.setDate(now.getDate() - 30);
    } else if (startDate && !endDate) { endDate = now; }
    else if (!startDate && endDate) { startDate = new Date(endDate); startDate.setDate(endDate.getDate() - 30); }

    // If productId provided -> return product-level detail
    if (productId) {
      let productObjId = null;
      try { productObjId = mongoose.Types.ObjectId(productId); } catch(e) { productObjId = null; }
      // try looking up by id or name
      const product = productObjId 
        ? await Food.findById(productObjId).lean()
        : await Food.findOne({ name: productId }).lean();

      if (!product) return res.status(404).json({ success:false, message: "Product not found" });

      // salesOverTime for product: unwind orders->items with that product within date range
      const salesOverTime = await Order.aggregate([
        { $match: { payment: true, date: { $gte: startDate, $lte: endDate } } },
        { $unwind: "$items" },
        {
          $addFields: {
            "items.foodId": { $ifNull: ["$items.foodId", "$items._id"] },
            "items.qty": { $ifNull: ["$items.qty", 1] },
            "items.price": { $ifNull: ["$items.price", "$items.amount", 0] }
          }
        },
        // match item to product id or name
        {
          $match: {
            $or: [
              { "items.foodId": productObjId ? productObjId : null },
              { "items.name": product.name }
            ]
          }
        },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
            qty: { $sum: "$items.qty" },
            revenue: { $sum: { $multiply: ["$items.qty", "$items.price"] } },
            orders: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      // totals for product in window (from salesOverTime)
      const totals = salesOverTime.reduce((acc, r) => {
        acc.qty += r.qty || 0;
        acc.revenue += r.revenue || 0;
        acc.orders += r.orders || 0;
        return acc;
      }, { qty: 0, revenue: 0, orders: 0 });

      // repeat buyers for this product: users who bought this product more than once in range
      const buyersAgg = await Order.aggregate([
        { $match: { payment: true, date: { $gte: startDate, $lte: endDate } } },
        { $unwind: "$items" },
        {
          $addFields: {
            "items.foodId": { $ifNull: ["$items.foodId", "$items._id"] },
            "items.qty": { $ifNull: ["$items.qty", 1] }
          }
        },
        {
          $match: {
            $or: [
              { "items.foodId": productObjId ? productObjId : null },
              { "items.name": product.name }
            ]
          }
        },
        { $group: { _id: { userId: "$userId" }, qty: { $sum: "$items.qty" }, orders: { $sum: 1 } } },
        { $sort: { qty: -1 } }
      ]);
      const repeatBuyers = buyersAgg.filter(b => (b.orders || 0) > 1).length;

      // optional fields: stock if present on product doc
      const stock = product?.stock ?? product?.quantity ?? null;

      return res.json({
        success: true,
        data: {
          product: {
            _id: product._id,
            name: product.name,
            category: product.category,
            price: product.price ?? null,
            stock,
          },
          totals,
          salesOverTime,
          repeatBuyers,
          buyersAggSample: buyersAgg.slice(0,10) // sample list for possible drilldown
        }
      });
    }

    // LIST mode: product summaries across catalog in window
    // Approach:
    // 1) unwind orders->items within window, group by product (by foodObjId or name)
    // 2) compute qty, revenue, orders count, avg price
    const itemsAgg = await Order.aggregate([
      { $match: { payment: true, date: { $gte: startDate, $lte: endDate } } },
      { $unwind: "$items" },
      {
        $addFields: {
          "items.foodId": { $ifNull: ["$items.foodId", "$items._id", null] },
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
          foodId: { $ifNull: ["$foodDoc._id", "$items.foodId", "$items.name"] },
          name: { $ifNull: ["$foodDoc.name", "$items.name", "Unknown"] },
          category: { $ifNull: ["$foodDoc.category", "$items.category", "Uncategorized"] },
          qty: "$items.qty",
          revenue: { $multiply: ["$items.qty", "$items.price"] },
          price: "$items.price",
          userId: "$userId"
        }
      },
      // optional filter by category
      ...(category ? [{ $match: { category } }] : []),
      {
        $group: {
          _id: "$foodId",
          name: { $first: "$name" },
          category: { $first: "$category" },
          qty: { $sum: "$qty" },
          revenue: { $sum: "$revenue" },
          orders: { $sum: 1 },
          avgPrice: { $avg: "$price" },
          buyers: { $addToSet: "$userId" }
        }
      },
      {
        $project: {
          _id: 1,
          name: 1,
          category: 1,
          qty: 1,
          revenue: 1,
          orders: 1,
          avgPrice: { $round: ["$avgPrice", 2] },
          buyersCount: { $size: "$buyers" }
        }
      },
      { $sort: { revenue: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit }
    ]);

    // For each result try to attach stock if available in Food collection
    const enriched = await Promise.all(itemsAgg.map(async (p) => {
      try {
        // p._id might be ObjectId or string
        let prod = null;
        try {
          prod = await Food.findById(p._id).lean();
        } catch (e) {
          // try lookup by name
          prod = await Food.findOne({ name: p.name }).lean();
        }
        return {
          ...p,
          stock: prod?.stock ?? prod?.quantity ?? null
        };
      } catch (err) {
        return p;
      }
    }));

    // quick summary counts
    const totalProductsCount = await Food.countDocuments({});
    return res.json({
      success: true,
      data: {
        products: enriched,
        pagination: { page, limit },
        totalProductsCount,
        range: { start: startDate ? startDate.toISOString().slice(0,10) : null, end: endDate ? endDate.toISOString().slice(0,10) : null }
      }
    });
  } catch (err) {
    console.error("product-insights error:", err);
    return res.status(500).json({ success: false, message: "Server error", error: err.message });
  }
});

export default router;
