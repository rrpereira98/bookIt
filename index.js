import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import pg from "pg";

const app = express();
const port = 3000;

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

// const db = new pg.Client({
//   user: "postgres",
//   host: "localhost",
//   database: "permalist",
//   password: "R0bram20!",
//   port: 5432,
// });
// db.connect();

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
    const results = booksList;
    console.log("from /", results);
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
  const bookCover = await getCover(req.body.oclc);
  booksList.push({
    title: req.body.title,
    author: req.body.author,
    bookCover: bookCover,
  });
  res.redirect("/");
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
