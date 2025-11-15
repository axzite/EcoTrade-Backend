import express from "express";
import cors from "cors";
import { connectDB } from "./config/db.js";
import userRouter from "./routes/userRoute.js";
import foodRouter from "./routes/foodRoute.js";
import cartRouter from "./routes/cartRoute.js";
import orderRouter from "./routes/orderRoute.js";
import { config } from "dotenv";
import broadcastRoutes from "./routes/broadcastRoute.js";
import adminAnalyticsRouter from "./routes/adminAnalytics.js";
import productInsightsRouter from "./routes/productInsights.js";


import "dotenv/config";

// Load environment variables
config({ path: "./config/config.env" });

const app = express();
const port = process.env.PORT;

// Middlewares
app.use(express.json());
app.use(
  cors({
    origin: [
      process.env.FRONTEND_URI,
      process.env.FRONTEND_URI_SECOND,
      process.env.FRONTEND_URI_THIRD,
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    credentials: true,
  })
);

console.log(process.env.FRONTEND_URI, "frontend url");
console.log(process.env.FRONTEND_URI_SECOND, "frontend url second");

// DB connection
connectDB();

// API endpoints
app.use("/api/user", userRouter);
app.use("/api/food", foodRouter);
app.use("/images", express.static("uploads"));
app.use("/api/cart", cartRouter);
app.use("/api/order", orderRouter);
app.use("/api/broadcast", broadcastRoutes);
app.use("/api/admin", adminAnalyticsRouter);
app.use("/api/admin/product-insights", productInsightsRouter);


// Root test
app.get("/", (req, res) => {
  res.send("API Working");
});

app.listen(port, () =>
  console.log(`✅ Server started on http://localhost:${port}`)
);
