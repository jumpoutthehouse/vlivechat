const multer = require("multer");
const path   = require("path");
const fs     = require("fs");
const express = require("express");
const router = express.Router();

// Re-export only the router (actual upload logic is in messages.js)
// This file handles the static serving already done in app.js

// GET /api/v1/uploads/info — info endpoint
router.get("/info", (_req, res) => {
  res.json({
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760,
    allowedTypes: ["image/*", "application/pdf", ".doc", ".docx", ".xls", ".xlsx", ".txt", "audio/*", "video/mp4"],
  });
});

module.exports = router;
