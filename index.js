const express = require("express");
const app = express();
const cors = require('cors');
require('dotenv').config();
var jwt = require('jsonwebtoken');
//stripe payment secret key
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const port = process.env.PORT || 5000;



// middleware 

app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@expressdb.hgdaj4q.mongodb.net/?retryWrites=true&w=majority`;


// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();

        const usersCollection = client.db("coffee-house").collection("users");
        const contactCollection = client.db("coffee-house").collection("contact");
        const menuCollection = client.db("coffee-house").collection("menu");
        const cartCollection = client.db("coffee-house").collection("carts");
        const paymentsCollection = client.db("coffee-house").collection("payments");

        //Midleware
        const verifyToken = (req, res, next) => {
            if (!req.headers.authorization) {
                return res.status(401).send({ messge: "unauthorize access" })
            }
            const token = req.headers.authorization.split(" ")[1];
            jwt.verify(token, process.env.ACCESS_TOEKN_SECRET, (error, decoded) => {
                if (error) {
                    return res.status(401).send({ messge: "Unauthorize access" })
                }
                req.decoded = decoded;
                next()
            })
        }

        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            const isAdmin = user?.role === "admin";
            if (!isAdmin) {
                return res.status(403).send({ message: "Aunauthorize access" })
            }
            next()
        }
        //jwt
        app.post("/jwt", async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOEKN_SECRET, { expiresIn: "1h" });
            res.send({ token })
        })
        //User related api
        app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
            const result = await usersCollection.find().toArray();
            res.send(result)
        });

        app.get("/users/admin/:email", verifyToken, async (req, res) => {
            const email = req.params.email;
            if (email !== req.decoded.email) {
                return res.status(401).send({ message: "Users Unauthorize" })
            }
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            let admin = false;
            if (user) {
                admin = user?.role == "admin"
            }
            res.send({ admin })
        })


        app.post("/users", async (req, res) => {
            const users = req.body;
            const query = { email: users.email };
            const oldUser = await usersCollection.findOne(query);
            if (oldUser) {
                return res.send({ messge: "Already users an a account", insertedId: null })
            }
            const result = await usersCollection.insertOne(users);
            res.send(result);
        });
        app.delete("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await usersCollection.deleteOne(query);
            res.send(result);

        });
        app.patch("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const updateDoc = {
                $set: {
                    role: "admin"
                },
            };
            const result = await usersCollection.updateOne(query, updateDoc);
            res.send(result);
        })

        //contact form related api 
        app.post("/contact", async (req, res) => {
            const contactInfo = req.body;
            const result = await contactCollection.insertOne(contactInfo)
            res.send(result);
        })
        //menu related api

        app.get('/menu', async (req, res) => {
            const result = await menuCollection.find().toArray();
            res.send(result)
        })
        app.get("/menu/:id", async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await menuCollection.findOne(query);
            res.send(result);
        })
        app.post("/menu", verifyToken, verifyAdmin, async (req, res) => {
            const data = req.body;
            const result = await menuCollection.insertOne(data);
            res.send(result);
        });
        app.patch("/menu/:id", async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const updateItmes = req.body;
            const updateDoc = {
                $set: {
                    name: updateItmes.name,
                    category: updateItmes.category,
                    price: updateItmes.price,
                    recipe: updateItmes.recipe,
                    image: updateItmes.image
                },
            };
            const result = await menuCollection.updateOne(query, updateDoc);
            res.send(result);
        })
        app.delete("/menu/:id", verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await menuCollection.deleteOne(query);
            res.send(result);
        })
        // cart api

        app.get("/carts", async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const result = await cartCollection.find(query).toArray();
            res.send(result);
        })
        app.post("/carts", async (req, res) => {
            const cartItem = req.body;
            const result = await cartCollection.insertOne(cartItem);
            res.send(result);
        });
        app.delete("/carts/:id", async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await cartCollection.deleteOne(query);
            res.send(result);
        });

        //Stripe Payments Saystem

        app.post("/create-payment-intent", async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100);
            console.log(amount, "ampunt check")
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                payment_method_types: ["card"]
            })
            res.send({
                clientSecret: paymentIntent.client_secret
            })
        })
        app.get("/payments/:email", verifyToken, async (req, res) => {
            const query = { email: req.params.email };
            if (req.params.email !== req.decoded.email) {
                return res.status(403).send({ message: "Forbiden sccess" })
            }
            const result = await paymentsCollection.find(query).toArray();
            res.send(result)

        })

        app.post("/payments", async (req, res) => {
            const payments = req.body;
            const paymentsResult = await paymentsCollection.insertOne(payments);
            const query = {
                _id: {
                    $in: payments.cartIds?.map(id => new ObjectId(id))
                }
            }
            const deleteItmes = await cartCollection.deleteMany(query);
            res.send({ paymentsResult, deleteItmes })
        })
        //admin home related api 
        app.get("/adminState", async (req, res) => {
            const users = await usersCollection.estimatedDocumentCount();
            const menuItems = await menuCollection.estimatedDocumentCount();
            const order = await paymentsCollection.estimatedDocumentCount();
            const result = await paymentsCollection.aggregate([
                {
                    $group: {
                        _id: null,
                        totalRevenue: {
                            $sum: "$price"
                        }
                    }
                }
            ]).toArray();
            const revenw = result.length > 0 ? result[0].totalRevenue : result.totalRevenue;
            const total = parseFloat(revenw.toFixed(2));

            res.send({
                users,
                menuItems,
                order,
                total
            })
        })

        //pipe;ome aggregate
        app.get("/orderState", async (req, res) => {
            const result = await paymentsCollection.aggregate([
                {
                    $unwind: "$menuIds"
                },
                {
                    $lookup: {
                        from: "menu",
                        localField: "menuIds",
                        foreignField: "_id",
                        as: "menuItems"

                    }
                },

                {
                    $unwind: "$menuItems"
                },
                {
                    $group: {
                        _id: "$menuItems.category",
                        quantity: { $sum: 1 },
                        totalRevenue: { $sum: "$menuItems.price" }
                    }
                }
            ]).toArray()

            res.send(result)
        })

        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);

app.get("/", (req, res) => {
    res.send("Coffee House Server is Running")
})

app.listen(port, () => {
    console.log(`server running is http://localhost:${port}`)
})