import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import pg from "pg";
import bcrypt from "bcrypt"
import session from "express-session";
import passport from "passport";
import { Strategy } from "passport-local";

const app = express();
const port = 3000;
const saltRounds = 10;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

app.use(
  session({
    secret: "SuperSecretWord",
    resave: false,
    saveUninitialized: true,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24,
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());

const db = new pg.Client({
  user: "postgres",
  host: "localhost",
  database: "bookit",
  password: "R0bram20!",
  port: 5432,
});
db.connect();

const booksList = [];

async function getCover(oclc) {
  try {
    const response = await axios.get(
      "https://covers.openlibrary.org/b/oclc/" + oclc + "-M.jpg?default=false",
      {
        responseType: "arraybuffer", // Fetch the image as binary data
      }
    );
    // Convert binary data to base64 string
    const bookCover = Buffer.from(response.data, "binary").toString("base64");

    return bookCover;
  } catch (error) {
    console.log(error);
  }
}

app.get("/login", async (req, res) => {
  res.render("login.ejs");
})

app.post("/login",
  passport.authenticate("local", {
    successRedirect: "/",
    failureRedirect: "/login",
  }))

app.get("/register", async (req, res) => {
  res.render("register.ejs");
})

app.post("/register", async (req, res) => {
  const email = req.body.username;
  const password = req.body.password;

  try {
    const checkResult = await db.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);

    if(checkResult.rows[0] > 0) {
      req.redirect("/login");
    } else {
      bcrypt.hash(password, saltRounds, async (err, hash) => {
        if (err) {
          console.error("Error hashing password:", err);
        } else {
          const result = await db.query(
            "INSERT INTO users (email, password) VALUES ($1, $2) RETURNING *",
            [email, hash]
          );
          const user = result.rows[0];
          req.login(user, (err) => {
            console.log("success");
            res.redirect("/");
          });
        }
      });
    }
  } catch (error) {
    console.log(err);
  }
})

// app.get("/", async (req, res) => {
//   try {
//     const data = await db.query("SELECT * FROM public.books ORDER BY id ASC");
//     const results = data.rows

//     await Promise.all(
//       results.map(async (book) => {
//         if (book.oclc !== undefined) {
//           book.bookCover = await getCover(book.oclc); // Resolve the promise
//           if(book.bookCover === undefined) {
//             book.bookCover = "unavailable"
//           }
//         } else {
//           book.bookCover = "unavailable";
//         }
//       })
//     );

//     // console.log(results);
//     res.render("index.ejs", { results });
//   } catch (error) {
//     console.log(error);
//   }
// });

// open library not working
app.get("/", async (req, res) => {

  if (req.isAuthenticated()) {
    try {
      console.log(req.user)
      const userId = req.user.id

      const data = await db.query("SELECT * FROM books WHERE user_id = $1;", [userId]);
      const results = data.rows

      results.map(book => {
          book.bookCover = "unavailable";
      })
      // console.log(results);
      res.render("index.ejs", { results });
    } catch (error) {
      console.log(error);
    }
  } else {
    res.redirect("/login")
  }
});
// -----------------------------------------------

app.get("/search", (req, res) => {
  if (req.isAuthenticated()) {
    res.render("search.ejs");
  } else {
    res.redirect("/login")
  }
});

app.post("/search", async (req, res) => {
  const searchParams = req.body.searchInput.trim().split(" ").join("+");

  try {
    const response = await axios.get(
      "https://openlibrary.org/search.json?q=" + searchParams + "&limit=5"
    );

    const results = [];

    for (let i = 0; i < response.data.docs.length; i++) {
      results.push({
        title: response.data.docs[i].title,
        author: response.data.docs[i].author_name,
        oclc: response.data.docs[i].oclc,
      });
    }
    // console.log(results);

    await Promise.all(
      results.map(async (book) => {
        if (book.oclc !== undefined) {
          book.bookCover = await getCover(book.oclc[0]); // Resolve the promise
          if(book.bookCover === undefined) {
            book.bookCover = "unavailable"
          }
        } else {
          book.bookCover = "unavailable";
        }
      })
    );

    console.log("from /search", results);

    res.render("results.ejs", { results });
  } catch (error) {
    console.log(error);
    res.send(error)
  }
});

app.post("/add", async (req, res) => {
  console.log(req.body);
  try {
    console.log(req.user)
    const userId = req.user.id

    //  trying to check if the book you are trying to add is in the collection or not
    const alreadyAddedCheck = await db.query("SELECT * FROM books WHERE title = $1 AND user_id = $2;", [req.body.title, userId])
    console.log("success")
    console.log(alreadyAddedCheck)
    if (alreadyAddedCheck.rows.length === 0) {
      await db.query("INSERT INTO books (title, author, oclc, user_id) VALUES ($1, $2, $3, $4);", [req.body.title, req.body.author, req.body.oclc, userId])
      res.redirect("/");
    } else {
      console.log("book already in collection")
      const err = "book already in collection"
      res.render("search.ejs", { err })
    }
  } catch (error) {
    console.log(error)
  }
});

app.get("/book/:id", async (req, res) => {
  if (req.isAuthenticated()) {
    try {
      const book = await (await db.query("select * from books where id = $1;", [req.params.id])).rows[0]
      console.log(book)
      // book.bookCover = await getCover(book.oclc)
      book.bookCover = undefined //openlb not working

      let notes = await db.query("SELECT * FROM notes WHERE book_id=$1;", [req.params.id])
      notes = notes.rows
      res.render("book.ejs", {book, notes})
    } catch (error) {
      console.log(error)
      res.send(error)
    }
  } else {
    res.redirect("/login")
  }
})

app.get("/note/:bookId", (req, res) => {
  if (req.isAuthenticated()) {
    const bookId = req.params.bookId
    res.render("note.ejs", {bookId})
  } else {
    res.redirect("/login")
  }
})

app.post("/note", async (req, res) => {
  await db.query("INSERT INTO notes (book_id, note) VALUES ($1, $2);", [req.body.bookId, req.body.note])
  res.redirect("/book/" + req.body.bookId)
})

app.get("/delete-note", async (req, res) => {
  if (req.isAuthenticated()) {
    await db.query("DELETE FROM notes WHERE id = $1;", [req.query.noteId])
    res.redirect("/book/" + req.query.bookId)
  } else {
    res.redirect("/login")
  }
})

app.get("/edit-note", async (req, res) => {
  if (req.isAuthenticated()) {
    const note = await (await db.query("SELECT * FROM notes WHERE id=$1;", [req.query.noteId])).rows[0]
    const bookId = note.book_id
    const noteText = note.note
    const noteId = note.id
    res.render("note.ejs", {bookId, noteText, noteId})
  } else {
    res.redirect("/login")
  }
})

app.post("/edit-note/:id", async (req, res) => {
  await db.query("UPDATE notes SET note = $1 WHERE id = $2;", [req.body.note, req.body.noteId])
  res.redirect("/book/" + req.body.bookId)
})

app.get("/delete-book/:id", async (req, res) => {
  if (req.isAuthenticated()) {
    await db.query("DELETE FROM notes WHERE book_id = $1;", [req.query.bookId])
    await db.query("DELETE FROM books WHERE id = $1;", [req.query.bookId])
    res.redirect("/")
  } else {
    res.redirect("/login")
  }
})

app.post("/rating", async (req, res) => {
  try {
    await db.query("UPDATE books SET rating = $1 WHERE id = $2", [req.body.rating, req.body.bookId])
    res.redirect("/book/" + req.body.bookId)
  } catch (error) {
    console.log(error)
  }
})

passport.use(
  new Strategy(async function verify(username, password, cb) {
    try {
      const result = await db.query("SELECT * FROM users WHERE email = $1 ", [
        username,
      ]);
      if (result.rows.length > 0) {
        const user = result.rows[0];
        const storedHashedPassword = user.password;
        bcrypt.compare(password, storedHashedPassword, (err, valid) => {
          if (err) {
            //Error with password check
            console.error("Error comparing passwords:", err);
            return cb(err);
          } else {
            if (valid) {
              //Passed password check
              return cb(null, user);
            } else {
              //Did not pass password check
              return cb(null, false);
            }
          }
        });
      } else {
        return cb("User not found");
      }
    } catch (err) {
      console.log(err);
    }
  })
);

passport.serializeUser((user, cb) => {
  cb(null, user);
});
passport.deserializeUser((user, cb) => {
  cb(null, user);
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
