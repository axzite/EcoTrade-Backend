import mongoose from "mongoose";

const foodSchema = new mongoose.Schema({
  name: String,
  description: String,
  price: Number,
  category: String,
  image: String,
  isVerified: {
    type: Number, // ✅ store 0 or 1
    default: 0
  }
});

const foodModel = mongoose.model("Food", foodSchema);

export default foodModel;
