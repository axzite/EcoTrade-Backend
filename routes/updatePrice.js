// POST /api/food/updatePrice
import FoodModel from '../models/foodModel.js';

export const updatePrice = async (req, res) => {
  try {
    const { id, price } = req.body;
    await FoodModel.findByIdAndUpdate(id, { price });
    res.json({ success: true, message: "Price updated successfully" });
  } catch (error) {
    res.json({ success: false, message: "Failed to update price" });
  }
};
