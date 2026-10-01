const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const morgan = require("morgan");
const path = require("path");
const connectDB = require("./config/db");

dotenv.config();

connectDB();

const app = express();

const allowedOrigins = (
  process.env.CLIENT_URL || 
  process.env.FRONTEND_URL ||
  "http://localhost:5173" ||
  "http://localhost:3000" ||
  "http:/192.168.1.50:5173"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || origin)
        return callback(null, true);
      return callback(new Error("CORS origin not allowed"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));

// app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use("/api/auth", require("./routes/auth"));
app.use("/api/courses", require("./routes/courses"));
app.use("/api/platforms", require("./routes/platforms"));
app.use("/api/customer", require("./routes/customer"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/contact", require("./routes/contact"));
app.use("/api/payment", require("./routes/payment"));
app.use("/api/videos", require("./routes/videos"));
app.use("/api/site", require("./routes/site"));
app.use("/api/testimonials", require("./routes/testimonials"));

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "SkyBirds E-Commerce Course Platform API is running 🚀",
    version: "2.0.0",
  });
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: err.message || "Server Error",
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
