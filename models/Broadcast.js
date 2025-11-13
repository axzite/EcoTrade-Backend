import mongoose from "mongoose";

const broadcastSchema = new mongoose.Schema(
  {
    sellerName: { type: String, required: true },
    message: { type: String, required: true },
  },
  { timestamps: true }
);

export default mongoose.model("Broadcast", broadcastSchema);
