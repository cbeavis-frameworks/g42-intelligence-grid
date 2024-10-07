import xlsx from "xlsx";
import fs from "fs";
import path from "path";

export async function parse() {
  const filename = new URL(import.meta.url).pathname;
  const dirname = path.dirname(filename);
  const spreadsheetPath = path.join(dirname, `./g42.xlsx`);

  const workbook = xlsx.readFile(spreadsheetPath);

  /* Generate use_cases.json */
  const useCasesSheet = workbook.Sheets["Use cases"];
  if (!useCasesSheet) {
    console.error("No 'Use cases' sheet found in the workbook.");
    process.exit(1);
  }
  // Convert sheet to JSON, starting from the second row (assuming first row is header)
  const useCasesRaw = xlsx.utils.sheet_to_json(useCasesSheet, {
    header: ["Industry", "Description"],
    range: 1,
  });
  const useCaseMap = {};
  const useCases = useCasesRaw.map((row) => {
    const industry = row.Industry || "";
    const description = row.Description || "";
    let group = null;
    let title = industry.trim();
    if (industry.includes("/")) {
      const [grp, ttl] = industry.split("/").map((s) => s.trim());
      group = grp;
      title = ttl;
    }
    const useCaseObj = {
      title: title,
      description: description,
      ...(group && { group: group }),
      count: 0, // Initialize count to 0
    };
    useCaseMap[title] = useCaseObj;
    return useCaseObj;
  });

  /* Generate elements.json */
  const elements = {
    surface: [],
    cloud: [],
    apps: [],
    space: [],
  };
  const elementMap = {
    surface: {},
    cloud: {},
    apps: {},
    space: {},
  };
  const elementSheets = [
    { sheetName: "Surface", key: "surface" },
    { sheetName: "Products & Apps", key: "apps" },
    { sheetName: "Cloud & Cyber", key: "cloud" },
    { sheetName: "Space", key: "space" },
  ];
  elementSheets.forEach(({ sheetName, key }) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      console.error(`No '${sheetName}' sheet found in the workbook.`);
      return;
    }
    // Convert sheet to JSON, starting from the second row (skip header)
    const rawData = xlsx.utils.sheet_to_json(sheet, {
      header: ["Element name", "Company", "Description"],
      range: 1,
    });
    // Process each row
    rawData.forEach((row) => {
      const title = row["Element name"] || "";
      const description = row["Description"] || "";
      const elementObj = {
        title: title,
        description: description,
        count: 0, // Initialize count to 0
      };
      elements[key].push(elementObj);
      elementMap[key][title] = elementObj;
    });
  });

  /* Generate solutions.json */
  const industrySheets = [
    "Cybersecurity",
    "Data Centers",
    "Defence",
    "Education",
    "Energy",
    "Financial Services",
    "Healthcare",
    "LLMs & Cloud",
    "Smart City",
    "Space & Geospatial",
    "Sport & Media",
    "Supply Chain",
  ];
  let allSolutions = [];
  industrySheets.forEach((industryName) => {
    const sheet = workbook.Sheets[industryName];
    if (!sheet) {
      console.error(`No '${industryName}' sheet found in the workbook.`);
      return;
    }
    // Get the range of the sheet
    const range = xlsx.utils.decode_range(sheet["!ref"]);
    let currentSolution = null;
    let elementsInSolution = {
      surface: [],
      cloud: [],
      apps: [],
      space: [],
    };
    for (let rowNum = range.s.r + 1; rowNum <= range.e.r; rowNum++) {
      const cellAddressA = { c: 0, r: rowNum };
      const cellAddressB = { c: 1, r: rowNum };
      const cellAddressC = { c: 2, r: rowNum };
      const cellAddressD = { c: 3, r: rowNum };
      const cellA = sheet[xlsx.utils.encode_cell(cellAddressA)];
      const cellB = sheet[xlsx.utils.encode_cell(cellAddressB)];
      const cellC = sheet[xlsx.utils.encode_cell(cellAddressC)];
      const cellD = sheet[xlsx.utils.encode_cell(cellAddressD)];
      // Check if cellA contains a number
      const no = cellA ? cellA.v : null;
      if (Number.isFinite(no)) {
        // Start a new solution
        if (currentSolution && currentSolution.title && currentSolution.title.trim()) {
          // Save previous solution if it has a title
          currentSolution.elements = elementsInSolution;
          allSolutions.push(currentSolution);
        }
        // Initialize a new solution
        currentSolution = {
          use_case: cellB && cellB.v ? cellB.v : "", // Use Case / Industry
          title: cellC && cellC.v ? cellC.v : "", // Solution name
          description: cellD && cellD.v ? cellD.v : "", // Solution description
          industry: industryName,
        };
        elementsInSolution = {
          surface: [],
          cloud: [],
          apps: [],
          space: [],
        };
      }
      // Collect elements from columns E to H
      const cellE = sheet[xlsx.utils.encode_cell({ c: 4, r: rowNum })]; // Surface
      const cellF = sheet[xlsx.utils.encode_cell({ c: 5, r: rowNum })]; // Cloud
      const cellG = sheet[xlsx.utils.encode_cell({ c: 6, r: rowNum })]; // Products & Services
      const cellH = sheet[xlsx.utils.encode_cell({ c: 7, r: rowNum })]; // Satellite
      if (cellE && cellE.v) {
        elementsInSolution.surface.push(cellE.v);
      }
      if (cellF && cellF.v) {
        elementsInSolution.cloud.push(cellF.v);
      }
      if (cellG && cellG.v) {
        elementsInSolution.apps.push(cellG.v);
      }
      if (cellH && cellH.v) {
        elementsInSolution.space.push(cellH.v);
      }
    }
    // After finishing the sheet, save the last solution if it has a title
    if (currentSolution && currentSolution.title && currentSolution.title.trim()) {
      currentSolution.elements = elementsInSolution;
      allSolutions.push(currentSolution);
    }
  });
  // Group solutions by use_case
  const groupedSolutions = {};
  const useCaseCounts = {}; // To store counts of solutions per use case
  const elementCounts = {
    surface: {},
    cloud: {},
    apps: {},
    space: {},
  }; // To store counts of elements
  allSolutions.forEach((solution) => {
    let use_case = solution.use_case && solution.use_case.trim() ? solution.use_case : "";
    if (use_case.includes("/")) {
      const [grp, ttl] = use_case.split("/").map((s) => s.trim());
      use_case = ttl;
    }
    if (use_case) {
      // Update use case counts
      if (!useCaseCounts[use_case]) {
        useCaseCounts[use_case] = 0;
      }
      useCaseCounts[use_case] += 1;
      if (!groupedSolutions[use_case]) {
        groupedSolutions[use_case] = [];
      }
      const solObj = {
        title: solution.title,
        description: solution.description,
        industry: solution.industry,
        elements: solution.elements,
      };
      groupedSolutions[use_case].push(solObj);
      // Update element counts
      const els = solution.elements;
      Object.keys(els).forEach((type) => {
        const titles = els[type];
        titles.forEach((title) => {
          if (!elementCounts[type][title]) {
            elementCounts[type][title] = 0;
          }
          elementCounts[type][title] += 1;
        });
      });
    }
  });
  // Update use case counts in useCaseMap
  Object.keys(useCaseCounts).forEach((title) => {
    const count = useCaseCounts[title];
    if (useCaseMap[title]) {
      useCaseMap[title].count = count;
    } else {
      // Use case not found in use_cases list
      console.warn(`Use case "${title}" found in solutions but not in use_cases list`);
    }
  });
  // Update element counts in elementMap
  Object.keys(elementCounts).forEach((type) => {
    const counts = elementCounts[type];
    Object.keys(counts).forEach((title) => {
      if (elementMap[type][title]) {
        elementMap[type][title].count = counts[title];
      } else {
        // Element not found in elements list
        console.warn(`Element "${title}" of type "${type}" found in solutions but not in elements list`);
      }
    });
  });
  // Convert groupedSolutions to the required JSON format
  const solutionsArray = [];
  let solutionCount = 0;
  for (const [use_case, solutionsList] of Object.entries(groupedSolutions)) {
    solutionsArray.push({
      use_case: use_case,
      solutions: solutionsList,
    });
    solutionCount += solutionsList.length;
  }
  const surfaceConnections = {};
  allSolutions.forEach((solution) => {
    const surfaceElements = solution.elements.surface;
    if (surfaceElements && surfaceElements.length > 0) {
      surfaceElements.forEach((element) => {
        if (!surfaceConnections[element]) {
          surfaceConnections[element] = new Set();
        }
        surfaceElements.forEach((otherElement) => {
          if (element !== otherElement) {
            surfaceConnections[element].add(otherElement);
          }
        });
      });
    }
  });
  // Convert surfaceConnections to array format
  const connectionsArray = Object.keys(surfaceConnections).map((element) => {
    const connectedSet = surfaceConnections[element];
    const connectedArray = Array.from(connectedSet);
    return {
      element: element,
      connected_to: connectedArray,
    };
  });
  // Write connections.json
  fs.writeFileSync("./data/connections.json", JSON.stringify(connectionsArray, null, 2));
  // Write JSON files
  // Write use_cases.json
  const useCasesArray = Object.values(useCaseMap);
  fs.writeFileSync("./data/use_cases.json", JSON.stringify(useCasesArray, null, 2));
  // Write elements.json
  fs.writeFileSync("./data/elements.json", JSON.stringify(elements, null, 2));
  // Write solutions.json
  fs.writeFileSync("./data/solutions.json", JSON.stringify(solutionsArray, null, 2));

  console.log("Parsed data successfully.");
}
