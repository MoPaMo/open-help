const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bcrypt = require("bcrypt");
const session = require("express-session");
const bodyParser = require("body-parser");
const path = require("path");
const dotenv = require("dotenv").config();
const helmet = require("helmet");
const Handlebars = require("handlebars");
const fs = require("fs");
const app = express();
if (!process.argv.includes("dev")) {
  app.use(helmet());
}

const port = 3000;

//load template
const userList = Handlebars.compile(
  fs.readFileSync(path.join(__dirname, "pages", "users.html"), "utf8")
);
// Database setup
let db;
try {
  db = new sqlite3.Database("./db.sqlite3");
} catch (err) {
  console.error(err.message);
  console.log("Did you forget to run setup.js?");
  process.exit(1); // Exit process with failure
}

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
app.get("/", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "/pages", "dashboard.html"));
});

// Add a route to serve the sign-in page
app.get("/sign-in", (req, res) => {
  res.sendFile(path.join(__dirname, "pages", "sign-in.html"));
});

app.post("/login", (req, res) => {
  const { username, password } = req.body;
  db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
    if (err) return res.status(500).send("Internal Server Error");
    if (!user) return res.redirect("/sign-in#error");

    bcrypt.compare(password, user.password, (err, result) => {
      if (err) return res.status(500).send("Internal Server Error");
      if (!result) return res.redirect("/sign-in#error");

      req.session.userId = user.id;
      const redirectTo = req.session.returnTo || "/";
      delete req.session.returnTo;
      res.redirect(redirectTo);
    });
  });
});
app.get("/register-user", requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, "pages", "register-user.html"));
});
app.post("/sign-up", requireLogin, (req, res) => {
  const { username, password, name } = req.body;

  // Basic input validation
  if (!username || !password || !name) {
    return res.status(400).send("All fields are required");
  }

  // Check if user already exists
  db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
    if (err) return res.status(500).send("Internal Server Error");
    if (user) return res.status(400).send("Username already exists");

    // Hash the password
    bcrypt.hash(password, 10, (err, hashedPassword) => {
      if (err) return res.status(500).send("Internal Server Error");

      const signInDate = new Date().toISOString();

      // Insert new user into the database
      db.run(
        "INSERT INTO users (username, password, name, sign_in_date) VALUES (?, ?, ?, ?)",
        [username, hashedPassword, name, signInDate],
        (err) => {
          if (err) return res.status(500).send("Internal Server Error");

          // Automatically log in the new user
          db.get(
            "SELECT id FROM users WHERE username = ?",
            [username],
            (err, user) => {
              if (err) return res.status(500).send("Internal Server Error");
              req.session.userId = user.id;
              res.redirect("/");
            }
          );
        }
      );
    });
  });
});

app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).send("Internal Server Error");
    res.redirect("/sign-in#logout");
  });
});

app.get("/users", requireLogin, (req, res) => {
  //select all users, render template
  db.all("SELECT * FROM users", (err, users) => {
    if (err) return res.status(500).send("Internal Server Error");
    //use handlebars to render template
    res.send(userList({ users }));
  });
});

app.get("/template", (req, res) => {
  res.sendFile(path.join(__dirname, "pages", "template.html"));
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
