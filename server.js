
require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Invoice database model
const invoiceSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  client: { type: String, required: true, trim: true },
  date: { type: String, required: true },
  items: [{
    id: String,
    desc: { type: String, required: true, trim: true },
    qty: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 }
  }],
  total: { type: Number, required: true, min: 0 },
  status: {
    type: String,
    enum: ["paid", "pending"],
    default: "pending"
  },
  createdAt: { type: String, default: () => new Date().toISOString() }
}, { versionKey: false });

const clientSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true, trim: true },
  email: { type: String, trim: true, default: "" },
  phone: { type: String, trim: true, default: "" },
  address: { type: String, trim: true, default: "" }
}, { versionKey: false });

const Invoice = mongoose.model("Invoice", invoiceSchema);
const Client = mongoose.model("Client", clientSchema);

// Health check
app.get("/api/health", (req, res) => {
  res.json({ message: "RDK Bills API is running" });
});

// INVOICES: Create
app.post("/api/invoices", async (req, res, next) => {
  try {
    const { id, client, date, items, status } = req.body;

    if (!id || !client?.trim() || !date ||
        !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        error: "Invoice details and at least one item are required."
      });
    }

    const validItems = items.every(item =>
      item.desc?.trim() &&
      Number.isFinite(Number(item.qty)) &&
      Number(item.qty) >= 1 &&
      Number.isFinite(Number(item.price)) &&
      Number(item.price) > 0
    );

    if (!validItems) {
      return res.status(400).json({ error: "Invalid invoice items." });
    }

    const cleanItems = items.map(item => ({
      id: String(item.id || ""),
      desc: item.desc.trim(),
      qty: Number(item.qty),
      price: Number(item.price),
      total: Number(item.qty) * Number(item.price)
    }));

    const total = cleanItems.reduce((sum, item) => sum + item.total, 0);

    const invoice = await Invoice.create({
      id, client: client.trim(), date,
      items: cleanItems, total,
      status: status === "paid" ? "paid" : "pending"
    });

    res.status(201).json(invoice);
  } catch (error) {
    next(error);
  }
});

// INVOICES: Read, search, filter and sort
app.get("/api/invoices", async (req, res, next) => {
  try {
    const filter = {};

    if (["paid", "pending"].includes(req.query.status)) {
      filter.status = req.query.status;
    }

    if (req.query.search) {
      const term = req.query.search.trim();
      filter.$or = [
        { client: { $regex: term, $options: "i" } },
        { id: { $regex: term, $options: "i" } }
      ];
    }

    const sortOrder = req.query.sort === "oldest" ? 1 : -1;
    const invoices = await Invoice.find(filter).sort({ date: sortOrder });

    res.json(invoices);
  } catch (error) {
    next(error);
  }
});

// INVOICES: Update
app.put("/api/invoices/:id", async (req, res, next) => {
  try {
    const allowed = ["client", "date", "items", "total", "status"];
    const changes = {};

    for (const key of allowed) {
      if (req.body[key] !== undefined) changes[key] = req.body[key];
    }

    const invoice = await Invoice.findOneAndUpdate(
      { id: req.params.id },
      { $set: changes },
      { new: true, runValidators: true }
    );

    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found." });
    }

    res.json(invoice);
  } catch (error) {
    next(error);
  }
});

// INVOICES: Delete
app.delete("/api/invoices/:id", async (req, res, next) => {
  try {
    const invoice = await Invoice.findOneAndDelete({ id: req.params.id });

    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found." });
    }

    res.json({ message: "Invoice deleted successfully." });
  } catch (error) {
    next(error);
  }
});

// CLIENTS: Create
app.post("/api/clients", async (req, res, next) => {
  try {
    const { id, name, email = "", phone = "", address = "" } = req.body;

    if (!id || !name?.trim()) {
      return res.status(400).json({
        error: "Client ID and name are required."
      });
    }

    const client = await Client.create({
      id, name: name.trim(), email, phone, address
    });

    res.status(201).json(client);
  } catch (error) {
    next(error);
  }
});

// CLIENTS: Read and search
app.get("/api/clients", async (req, res, next) => {
  try {
    const filter = {};

    if (req.query.search) {
      filter.name = { $regex: req.query.search.trim(), $options: "i" };
    }

    res.json(await Client.find(filter).sort({ name: 1 }));
  } catch (error) {
    next(error);
  }
});

// CLIENTS: Update
app.put("/api/clients/:id", async (req, res, next) => {
  try {
    const allowed = ["name", "email", "phone", "address"];
    const changes = {};

    for (const key of allowed) {
      if (req.body[key] !== undefined) changes[key] = req.body[key];
    }

    const client = await Client.findOneAndUpdate(
      { id: req.params.id },
      { $set: changes },
      { new: true, runValidators: true }
    );

    if (!client) {
      return res.status(404).json({ error: "Client not found." });
    }

    res.json(client);
  } catch (error) {
    next(error);
  }
});

// CLIENTS: Delete
app.delete("/api/clients/:id", async (req, res, next) => {
  try {
    const client = await Client.findOneAndDelete({ id: req.params.id });

    if (!client) {
      return res.status(404).json({ error: "Client not found." });
    }

    res.json({ message: "Client deleted successfully." });
  } catch (error) {
    next(error);
  }
});

// Error handling
app.use((error, req, res, next) => {
  console.error(error.message);

  if (error.code === 11000) {
    return res.status(409).json({ error: "This record ID already exists." });
  }

  if (error.name === "ValidationError" ||
      error.name === "CastError") {
    return res.status(400).json({ error: "Invalid data supplied." });
  }

  res.status(500).json({ error: "Server error. Please try again." });
});

// Start only after MongoDB connects
async function startServer() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing from .env");
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB successfully.");

  const port = process.env.PORT || 3000;

  app.listen(port, () => {
    console.log(`RDK Bills API running on port ${port}`);
  });
}

startServer().catch(error => {
  console.error("Could not start the server:", error.message);
  process.exit(1);
});
