import express from "express";
import { parse } from "./parse.js";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Express application
const app = express();
app.set("port", 8080);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, "public")));

// Serve the main page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Endpoint to serve the data
app.get("/data", (req, res) => {
  // Read the connections data
  const dataPath = path.join(__dirname, "data", "connections.json");
  fs.readFile(dataPath, "utf8", (err, data) => {
    if (err) {
      console.error("Error reading connections.json:", err);
      res.status(500).send("Internal Server Error");
      return;
    }
    let buildingData;
    try {
      buildingData = JSON.parse(data);
    } catch (parseErr) {
      console.error("Error parsing connections.json:", parseErr);
      res.status(500).send("Internal Server Error");
      return;
    }
    // Transform data into nodes and edges
    const { nodesArray, edgesArray } = processData(buildingData);
    res.json({ nodes: nodesArray, edges: edgesArray });
  });
});

app.get("/files", (req, res) => {
  // List all files in the root directory and list them to send back in the response

  const files = fs.readdirSync("./");

  res.sendFile(JSON.stringify(files));
});

// Endpoint to get node positions
app.get("/positions", (req, res) => {
  fs.readFile("./data/positions.json", "utf8", (err, data) => {
    if (err) {
      console.error("Error reading positions.json:", err);
      res.status(404).send("{}"); // Send empty object if file not found
      return;
    }
    res.type("application/json");
    res.send(data);
  });
});

// Endpoint to save node positions
app.post("/positions", (req, res) => {
  const positions = req.body;
  fs.writeFile("./data/positions.json", JSON.stringify(positions, null, 2), (err) => {
    if (err) {
      console.error("Error writing positions.json:", err);
      res.status(500).send("Internal Server Error");
      return;
    }
    res.status(200).send("Positions saved");
  });
});

// Function to process data into nodes and edges
function processData(buildingData) {
  const nodes = [];
  const edges = [];
  const nodeIds = {};
  // Assign a unique ID to each node
  buildingData.forEach((item, index) => {
    const id = index + 1;
    nodeIds[item.element] = id;
    nodes.push({ id, label: item.element });
  });
  // Create edges based on the connections
  buildingData.forEach((item) => {
    const fromId = nodeIds[item.element];
    item.connected_to.forEach((connectedElement) => {
      const toId = nodeIds[connectedElement];
      if (fromId && toId) {
        // Create a unique key to avoid duplicate edges
        const edgeKey = [fromId, toId].sort().join("-");
        if (!edges.some((edge) => [edge.from, edge.to].sort().join("-") === edgeKey)) {
          edges.push({ from: fromId, to: toId });
        }
      }
    });
  });
  return { nodesArray: nodes, edgesArray: edges };
}

// Start the server and listen on the configured port
app.listen(app.get("port"), function () {
  //parse();
  console.log(`Server listening on port ${app.get("port")}`);
});

export default app;
