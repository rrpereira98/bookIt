import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import pg from "pg";

const app = express();
const port = 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

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

app.get("/", async (req, res) => {
  try {
    const data = await db.query("SELECT * FROM public.books ORDER BY id ASC");
    const results = data.rows

    await Promise.all(
      results.map(async (book) => {
        if (book.oclc !== undefined) {
          book.bookCover = await getCover(book.oclc); // Resolve the promise
          if(book.bookCover === undefined) {
            book.bookCover = "unavailable"
          }
        } else {
          book.bookCover = "unavailable";
        }
      })
    );

    // console.log(results);
    res.render("index.ejs", { results });
  } catch (error) {
    console.log(error);
  }
});

app.get("/search", (req, res) => {
  res.render("search.ejs");
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
  }
});

app.post("/add", async (req, res) => {
  console.log(req.body);
  try {
    //  trying to check if the book you are trying to add is in the collection or not
    const test = await db.query("SELECT * FROM books WHERE title = $1;", [req.body.title])
    console.log("success")
    console.log(test)
    if (test.rows.length === 0) {
      await db.query("INSERT INTO books (title, author, oclc) VALUES ($1, $2, $3);", [req.body.title, req.body.author, req.body.oclc])
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
  const book = await (await db.query("select * from books where id = $1;", [req.params.id])).rows[0]
  console.log(book)
  book.bookCover = await getCover(book.oclc)

  let notes = await db.query("SELECT * FROM notes WHERE book_id=$1;", [req.params.id])
  notes = notes.rows
  res.render("book.ejs", {book, notes})
})

app.get("/note/:bookId", (req, res) => {
  const bookId = req.params.bookId
  res.render("note.ejs", {bookId})
})

app.post("/note", async (req, res) => {
  await db.query("INSERT INTO notes (book_id, note) VALUES ($1, $2);", [req.body.bookId, req.body.note])
  res.redirect("/book/" + req.body.bookId)
})

app.get("/delete-note", async (req, res) => {
  await db.query("DELETE FROM notes WHERE id = $1;", [req.query.noteId])
  res.redirect("/book/" + req.query.bookId)
})

app.get("/edit-note", async (req, res) => {
  const note = await (await db.query("SELECT * FROM notes WHERE id=$1;", [req.query.noteId])).rows[0]
  const bookId = note.book_id
  const noteText = note.note
  const noteId = note.id
  res.render("note.ejs", {bookId, noteText, noteId})
})

app.post("/edit-note/:id", async (req, res) => {
  await db.query("UPDATE notes SET note = $1 WHERE id = $2;", [req.body.note, req.body.noteId])
  res.redirect("/book/" + req.body.bookId)
})

app.get("/delete-book/:id", async (req, res) => {
  await db.query("DELETE FROM notes WHERE book_id = $1;", [req.query.bookId])
  await db.query("DELETE FROM books WHERE id = $1;", [req.query.bookId])
  res.redirect("/")
})

app.post("/rating", async (req, res) => {
  try {
    await db.query("UPDATE books SET rating = $1 WHERE id = $2", [req.body.rating, req.body.bookId])
    res.redirect("/book/" + req.body.bookId)
  } catch (error) {
    console.log(error)
  }
})

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
