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
const { OpenAI } = require("openai");
const Imap = require("imap");
const simpleParser = require("mailparser").simpleParser;
const config = JSON.parse(fs.readFileSync("config.json", "utf8"));

const port = 3000;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

const transporter = nodemailer.createTransport({
  host: config.send.host,
  port: config.send.port,
  auth: {
    user: config.send.user,
    pass: config.send.password,
  },
});

// Set up IMAP for receiving emails
const imapConfig = {
  user: config.receive.user,
  password: config.receive.password,
  host: config.receive.host,
  port: config.receive.port,
  tls: true,
};

// Function to process incoming emails
async function processEmail(email) {
  const prompt = `Email: ${email.subject}\n\n${email.text}\n\nResponse:`;

  const response = await openai.chat.completions.create({
    model: "gpt-4", // Replace with your desired model
    messages: [
      {
        role: "system",
        content: "You are a helpful assistant that responds to emails.",
      },
      { role: "user", content: prompt },
    ],
    max_tokens: 150,
  });

  await transporter.sendMail({
    from: config.send.user,
    to: email.from.text,
    subject: `Re: ${email.subject}`,
    text: response.choices[0].message.content.trim(),
  });

  db.run("INSERT INTO interactions (email, response) VALUES (?, ?)", [
    email.text,
    response.choices[0].message.content,
  ]);
}

// Function to check emails
function checkEmails() {
  const imap = new Imap(imapConfig);

  imap.once("ready", () => {
    imap.openBox("INBOX", false, (err, box) => {
      if (err) throw err;
      const f = imap.seq.fetch("1:*", {
        bodies: ["HEADER", "TEXT"],
        markSeen: true,
      });
      f.on("message", (msg) => {
        msg.on("body", (stream) => {
          simpleParser(stream, async (err, parsed) => {
            if (err) console.error(err);
            else await processEmail(parsed);
          });
        });
      });
      f.once("error", (err) => {
        console.error("Fetch error: " + err);
      });
      f.once("end", () => {
        console.log("Done fetching all messages!");
        imap.end();
      });
    });
  });

  imap.once("error", (err) => {
    console.error("IMAP error: " + err);
  });

  imap.once("end", () => {
    console.log("IMAP connection ended");
  });

  imap.connect();
}

setInterval(checkEmails, 5 * 60 * 1000);

// Start server
app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});
