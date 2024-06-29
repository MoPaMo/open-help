const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcryptjs");
const session = require("express-session");
const bodyParser = require("body-parser");
const path = require("path");

const app = express();
const port = 3000;

// Database setup
const db = new sqlite3.Database("./db.sqlite3");

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use(
  session({
    secret: process.env.SESSION_KEY,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }, // Set to true in production with HTTPS
  })
);

// Routes
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Add a route to serve the sign-in page
app.get("/sign-in", (req, res) => {
  res.sendFile(path.join(__dirname, "pages", "sign-in.html"));
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;

  db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
    if (err) return res.status(500).send("Internal Server Error");
    if (!user) return res.status(400).send("Invalid username or password");

    bcrypt.compare(password, user.password, (err, result) => {
      if (err) return res.status(500).send("Internal Server Error");
      if (!result) return res.status(400).send("Invalid username or password");

      req.session.userId = user.id;
      const redirectTo = req.session.returnTo || '/';
      delete req.session.returnTo;
      res.redirect(redirectTo);
    });
  });
});

app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).send("Internal Server Error");
    res.send("Logout successful");
  });
});

// Middleware to require login
function requireLogin(req, res, next) {
  if (!req.session.userId) {
    req.session.returnTo = req.originalUrl;
    return res.redirect("/sign-in");
  }
  next();
}

// Example of a protected route
app.get("/protected", requireLogin, (req, res) => {
  res.send("This is a protected route. Only logged in users can see this.");
});

// Start server
app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});