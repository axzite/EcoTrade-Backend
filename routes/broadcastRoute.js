import express from "express";
import Broadcast from "../models/Broadcast.js";

const router = express.Router();

router.post("/add", async (req, res) => {
  try {
    const { title, message, sellerName } = req.body;
    const newBroadcast = new Broadcast({ title, message, sellerName });
    await newBroadcast.save();
    res.json({ success: true, message: "Broadcast added!" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/all", async (req, res) => {
  try {
    const broadcasts = await Broadcast.find().sort({ date: -1 });
    res.json({ success: true, data: broadcasts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
