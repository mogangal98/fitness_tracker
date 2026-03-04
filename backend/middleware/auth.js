const jwt = require("jsonwebtoken");

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Missing or invalid token" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || "dev-secret-change-me");
    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

module.exports = authMiddleware;
