require("dotenv").config();
const express = require("express");
const app = express();
const port = process.env.PORT || 5000;
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
const stripe = require("stripe")(process.env.PAYMENT_KEY);

//middleware
app.use(cors());
app.use(express.json());

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res
      .status(401)
      .send({ error: true, message: "unauthorized access" });
  }
  // bearer token
  const token = authorization.split(" ")[1];

  jwt.verify(token, process.env.JWT_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res
        .status(401)
        .send({ error: true, message: "unauthorized access" });
    }
    req.decoded = decoded;
    next();
  });
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.mkyjka1.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    client.connect();
    //------------------------------
    //--------COLLECTION-----------
    const coursesCollection = client.db("summer_school").collection("courses");
    const usersCollection = client.db("summer_school").collection("users");
    const paymentHistoryCollection = client
      .db("summer_school")
      .collection("payment_history");
    const cartCollection = client.db("summer_school").collection("cart");
    //------------------------------

    //------------JWT-------------------
    app.post("/jwt", (req, res) => {
      const students = req.body;
      const token = jwt.sign(students, process.env.JWT_TOKEN_SECRET, {
        expiresIn: "24h",
      });
      res.send({ token });
    });

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const student = await usersCollection.findOne(query);
      if (student?.role !== "admin") {
        return res
          .status(403)
          .send({ error: true, message: "access forbidden" });
      }
      next();
    };
    const verifyMentor = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const student = await usersCollection.findOne(query);
      if (student?.role !== "mentor") {
        return res
          .status(403)
          .send({ error: true, message: "access forbidden" });
      }
      next();
    };
    //-----------------------------------------------------

    //-------------------------OPEN_ROUTE----------------------------
    app.get("/courses", async (req, res) => {
      const result = await coursesCollection
        .find({ status: "approved" })
        .toArray();
      res.send(result);
    });

    app.get("/courses/popular", async (req, res) => {
      const result = await coursesCollection
        .find({ status: "approved" })
        .sort({ enrolled: -1 })
        .limit(6)
        .toArray();
      res.send(result);
    });

    //user registration
    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "Already A registered Student" });
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    app.post("/cart", async (req, res) => {
      const item = req.body;
      const result = await cartCollection.insertOne(item);
      res.send(result);
    });

    app.delete("/cart/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cartCollection.deleteOne(query);
      res.send(result);
    });
    //------------------------------------------------------

    //--------------------STUDENT-API-------------------------
    app.get("/cart", verifyJWT, async (req, res) => {
      const email = req.query.email;
      if (!email) {
        res.send([]);
      }
      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res.status(403).send({ error: true, message: "access denied" });
      }
      const query = { email: email };
      const result = await cartCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/cart/enrolled", verifyJWT, async (req, res) => {
      const email = req.query.email;
      if (!email) {
        res.send([]);
      }
      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res.status(403).send({ error: true, message: "access denied" });
      }
      const query = { email: email, enrolled: "enrolled" };
      const result = await cartCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/cart/:id", verifyJWT, async (req, res) => {
      const email = req.query.email;
      if (!email) {
        res.send([]);
      }
      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res
          .status(403)
          .send({ error: true, message: "unauthorize access" });
      }
      const id = req.params.id;
      const query = { email: email, _id: new ObjectId(id) };
      const result = await cartCollection.findOne(query);
      res.send(result);
    });

    app.get("/users/admin/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      if (!email) {
        return res.send([]);
      }
      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res
          .status(403)
          .send({ error: true, message: "unauthorize access" });
      }
      const query = { role: "admin", email: email };
      const result = await usersCollection.findOne(query);
      res.send({ admin: !result ? false : result.role === "admin" });
    });

    app.get("/users/mentor/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      if (!email) {
        return res.send([]);
      }
      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res
          .status(403)
          .send({ error: true, message: "unauthorize access" });
      }
      const query = { role: "mentor", email: email };

      const result = await usersCollection.findOne(query);
      res.send({ admin: !result ? false : result.role === "mentor" });
    });

    //--------------------------------------------------------------------

    //------------------Admin_ONLY_API-----------------------
    //course for only admin
    app.get("/courses/uncensored", verifyJWT, verifyAdmin, async (req, res) => {
      const email = req.query.email;
      if (!email) {
        res.send([]);
      }
      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res
          .status(403)
          .send({ error: true, message: "unauthorize access" });
      }
      const result = await coursesCollection.find({}).toArray();
      res.send(result);
    });

    app.get("/users", verifyJWT, verifyAdmin, async (req, res) => {
      const email = req.query.email;
      if (!email) {
        res.send([]);
      }
      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res
          .status(403)
          .send({ error: true, message: "unauthorize access" });
      }
      const result = await usersCollection.find({}).toArray();
      res.send(result);
    });

    //user promotion api
    app.put("/users/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const role = req.query.role;
      console.log(role)
      const email = req.query.email;
      console.log(email)
      if (!email) {
        res.send([]);
      }
      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res
          .status(403)
          .send({ error: true, message: "unauthorize access" });
      }
      const query = { _id: new ObjectId(id) };
      const updatedData = {
        $set: {
          role: role,
        },
      };
      const options = { upsert: true };

      const result = await usersCollection.updateOne(
        query,
        updatedData,
        options
      );
      console.log(result)
      res.send(result);
    });

    //course approval and denied
    app.put(
      "/courses/status/:id",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        const email = req.query.email;
        if (!email) {
          res.send([]);
        }
        const decodedEmail = req.decoded.email;
        if (email !== decodedEmail) {
          return res
            .status(403)
            .send({ error: true, message: "access denied" });
        }
        const id = req.params.id;
        const data = req.body;
        const options = { upsert: true };
        const query = { _id: new ObjectId(id) };
        const updatedData = {
          $set: {
            status: data.status,
          },
        };
        const result = await coursesCollection.updateOne(
          query,
          updatedData,
          options
        );
        res.send(result);
      }
    );
    app.put(
      "/courses/feedback/:id",
      verifyJWT,
      verifyAdmin,
      async (req, res) => {
        const email = req.query.email;
        if (!email) {
          res.send([]);
        }
        const decodedEmail = req.decoded.email;
        if (email !== decodedEmail) {
          return res
            .status(403)
            .send({ error: true, message: "access denied" });
        }
        const id = req.params.id;
        const data = req.body;
        const options = { upsert: true };
        const query = { _id: new ObjectId(id) };
        const updatedData = {
          $set: {
            feedback: data.feedback,
          },
        };
        const result = await coursesCollection.updateOne(
          query,
          updatedData,
          options
        );
        res.send(result);
      }
    );
    //---------------------------------------------------------

    //---------------------------MENTOR-API---------------------
    app.post("/courses", verifyJWT, verifyMentor, async (req, res) => {
      const newClass = req.body;
      const result = await coursesCollection.insertOne(newClass);
      res.send(result);
    });

    app.get(
      "/courses/my-courses",
      verifyJWT,
      verifyMentor,
      async (req, res) => {
        const email = req.query.email;
        const query = {
          mentor_email: email,
        };
        const result = await coursesCollection.find(query).toArray();
        res.send(result);
      }
    );

    app.get(
      "/courses/myClasses/:id",
      verifyJWT,
      verifyMentor,
      async (req, res) => {
        const email = req.query.email;

        if (!email) {
          res.send([]);
        }
        const decodedEmail = req.decoded.email;
        if (email !== decodedEmail) {
          return res
            .status(403)
            .send({ error: true, message: "unauthorize access" });
        }
        const id = req.params.id;
        const query = { email: email, _id: new ObjectId(id) };
        const result = await coursesCollection.findOne(query);
        res.send(result);
      }
    );

    app.put(
      "/courses/my-course",
      verifyJWT,
      verifyMentor,
      async (req, res) => {
        const data = req.body;
        const id = req.body._id;
        const mentor_email = req.body.mentor_email;
        console.log(req.body)
        console.log(req.params.id)

        const options = { upsert: true };
        const query = { mentor_email: mentor_email, _id: new ObjectId(id) };
        console.log(query)
        

        const updatedData = {
          $set: {
            course_title: data.course_title,
            course_img: data.course_img,
            price: data.price,
            available_seats: data.available_seats,
          },
        };
        console.log(updatedData)
        const result = await coursesCollection.updateOne(
          query,
          updatedData,
          options
        );
        res.send(result);
      }
    );

    //-------------------------------------------------------------------

    //---------------------------PAYMENT-----------------------
    app.post("/payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.post("/payments", verifyJWT, async (req, res) => {
      const payment = req.body;
      const insertResult = await paymentHistoryCollection.insertOne(payment);
      const options = { upsert: true };
      const changeEnrollStatus = await cartCollection.updateMany(
        { _id: new ObjectId(req.body.cartId) },
        { $set: { enrolled: "enrolled" } },
        options
      );

      const courseId = req.body.courseId;
      const updateSeats = await coursesCollection.updateMany(
        { _id: new ObjectId(courseId) },
        { $inc: { available_seats: -1, enrolled: +1 } },
        options
      );

      res.send({ insertResult, changeEnrollStatus, updateSeats });
    });

    app.get("/payments", verifyJWT, async (req, res) => {
      const email = req.query.email;
      if (!email) {
        res.send([]);
      }
      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res
          .status(403)
          .send({ error: true, message: "unauthorize access" });
      }
      const result = await paymentHistoryCollection
        .find({})
        .sort({ date: -1 })
        .toArray();
      res.send(result);
    });

    //--------------------------------------------------------

    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("The Web is running");
});

app.listen(port, () => {
  console.log(`listening port: 5000`);
});
