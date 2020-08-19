const express = require("express");
const mysql = require("mysql");
const session = require("express-session");
const MySQLStore = require("express-mysql-session");
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const bcrypt = require("bcrypt");

// get access to stuff stored in .env file
require("dotenv").config();
// init Express app
const app = express();

// Global middlewares for parsing request object
app.use(express.urlencoded({ extended: false }));

/****************************** Mysql connection ******************************/
// configuration
const databaseConfig = {
  host: "localhost",
  user: process.env.DB_User,
  port: 3306,
  password: process.env.DB_Password,
  database: "Chirp",
};

// Promisify database client
// tutorial: https://codeburst.io/node-js-mysql-and-promises-4c3be599909b
class Database {
  constructor(config) {
    this.connection = mysql.createConnection(
      config,
      console.log("Database connected...")
    );
  }

  query(sql, args) {
    return new Promise((resolve, reject) => {
      this.connection.query(sql, args, (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });
  }
  close() {
    return new Promise((resolve, reject) => {
      this.connection.end((err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }
}

// creating a database instance with modified(promisified) query methods
// Connection created automatically upon instantiating
const Chirp = new Database(databaseConfig);

/****************************** Session Setup ******************************/
const sessionStore = new MySQLStore(
  {
    host: "localhost",
    port: 3306,
    user: process.env.DB_User,
    password: process.env.DB_Password,
    createDatabaseTable: true,
    schema: {
      tableName: "session",
      columnNames: {
        session_id: "session_id",
        expires: "expires",
        data: "data",
      },
    },
  },
  Chirp
);

// How it works:
// 1. checks if there's a session id established in the session store

// 2. if there is, it validates it crytographically and tells the client whether the session is valid or not
// if it is valid, it will automatically attaches the connect.sid Cookie to the HTTP request

// 3. if there isn't, it creates a new session, takes a crytographic hash of the session,
// and stores that value in a Cookie called connect.sid
// it then attaches the set_cookie HTTP Header to the response object with the hashed value (set_cookie: connect.sid=hahsed_value)
app.use(
  session({
    secret: process.env.SECRET,
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
  })
);
// what the express-session middleware does:
// a middleware has the ability to alter the res and req object and pass them down to the next middleware until it reaches the end of the HTTP request
// When a new session is created, the session middleware attaches the following properties to the req object:
// req.sessionID
// req.cookie
// req.session : contains information about the session and is available for setting custom properties to
//
// i.e. tracking how many times a page is visited
// app.get('/tracking-route', (req, res, next)=>{
//   if (req.session.visitCount) {
//     req.session.visitCount += 1;
//   } else {
//     req.session.visitCount = 1;
//   }

//   res.send('<p> View count is:' + req.session.visitCount + '</p>');
// })

/****************************** Passport ******************************/
const validPassport = (password, hash) => {
  bcrypt(password, hash, (err, result) => {
    if (err) throw err;
    return result;
  });
};

const genPassword = (password) => {
  return bcrypt.hash(password, 10, (err, hash) => hash);
};

passport.use(
  "local",
  new LocalStrategy(
    {
      usernameField: "email",
      passwordField: "password",
      passReqToCallback: true,
    },
    (req, email, password, done) => {
      let user;
      Chirp.query(`SELECT * FROM User_Login WHERE email='${email}'`)
        .then((rows) => {
          user = rows[0];
          // no email
          if (!rows.length) done(null, false);
          // compare password returns a promise
          return bcrypt.compare(password, rows[0].password);
        })
        .then((match) => {
          if (match) {
            done(null, user);
          } else {
            done(null, false);
          }
        })
        .catch((err) => console.log(err));
    }
  )
);

passport.serializeUser(function (user, cb) {
  cb(null, user.email);
});

passport.deserializeUser(function (id, cb) {
  User.findById(id, function (err, user) {
    if (err) {
      return cb(err);
    }
    cb(null, user);
  });

  Chirp.query(`SELECT * FROM sessions WHERE session_id='${id}'`)
    .then((rows) => cb(rows[0]))
    .catch((err) => console.log(err));
});

app.use(passport.initialize());
app.use(passport.session());

/****************************** Routes ******************************/

app.get("/login", (req, res, next) => {
  const form =
    '<h1>Login Page</h1><form method="POST" action="/login">\
  Enter Email:<br><input type="email" name="email">\
  <br>Enter Password:<br><input type="password" name="password">\
  <br><br><input type="submit" value="Submit"></form>';
  res.send(form);
});

app.post(
  "/login",
  passport.authenticate("local", {
    failureRedirect: "/login",
    successRedirect: "login-success",
  }),
  (err, req, res, next) => {
    if (err) throw err;
    console.log("You're logged in.");
  }
);

app.get("/login-success", (req, res) => res.send("login success"));

app.get("/register", (req, res, next) => {
  res.send("<h1>Register Page</h1>");
});

app.post("/register", (req, res, next) => {});

const PORT = process.env.PORT || 5000;

app.listen(PORT, console.log(`Server listening on port ${PORT}...`));
