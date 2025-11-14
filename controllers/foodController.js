import foodModel from "../models/foodModel.js";
import fs from "fs";

// 📜 Get all food items
const listFood = async (req, res) => {
  try {
    const foods = await foodModel.find({});
    res.json({ success: true, data: foods });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: "Error" });
  }
};

// 🍴 Add new food
const addFood = async (req, res) => {
  try {
    const image_filename = `${req.file.filename}`;
    const isVerified = req.body.isVerified === "1" ? 1 : 0;

    const food = new foodModel({
      name: req.body.name,
      description: req.body.description,
      price: req.body.price,
      category: req.body.category,
      image: image_filename,
      isVerified: isVerified,
    });

    await food.save();
    res.json({ success: true, message: "Food Added" });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: "Error" });
  }
};

// 🗑️ Remove food
const removeFood = async (req, res) => {
  try {
    const food = await foodModel.findById(req.body.id);
    if (food) fs.unlink(`uploads/${food.image}`, () => {});
    await foodModel.findByIdAndDelete(req.body.id);
    res.json({ success: true, message: "Food Removed" });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: "Error" });
  }
};

// 💲 Update price
const updatePrice = async (req, res) => {
  try {
    const { id, price } = req.body;

    if (!id || price === undefined) {
      return res.status(400).json({ success: false, message: "ID and price are required" });
    }

    const updatedFood = await foodModel.findByIdAndUpdate(
      id,
      { price: price },
      { new: true }
    );

    if (!updatedFood) {
      return res.status(404).json({ success: false, message: "Food item not found" });
    }

    res.json({ success: true, message: "Price updated", data: updatedFood });
  } catch (error) {
    console.log(error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export { listFood, addFood, removeFood, updatePrice };
