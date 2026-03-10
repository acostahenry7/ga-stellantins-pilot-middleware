const axios = require("axios");
const https = require("https");
const fs = require("fs");
const {
  credentials: { clientId, clientSecret, grantType, username, password },
  pilotParams,
} = require("./config");
const { generateUrlParams, getModelByCode } = require("./utils");
const authURL = process.env.STELLANTIS_AUTHURL;
const stellantisUrl = process.env.STELLANTIS_URL;
const pilotUrl = process.env.PILOT_URL;

const httpsAgent = new https.Agent({
  cert: fs.readFileSync(`${__dirname}/cert.cer`),
  key: fs.readFileSync(`${__dirname}/key.pk`),
  rejectUnauthorized: false,
});

const runStateFile = `${__dirname}/run-state.json`;
const dataDir = `${__dirname}/data`;

const subOriginCodes = {
  sd: "FJ43VEW8D7BDJESQO",
  st: "FUUMONS9V11SZUZ39",
};

//AUTHENTICATION (This gets the Bearer Token)
const getToken = async () => {
  const url = `${authURL}?client_id=${clientId}&client_secret=${clientSecret}&grant_type=${grantType}&username=${username}&password=${password}`;

  return axios
    .get(url, {
      headers: {
        Accept: "*/*",
      },
      httpsAgent,
    })
    .then((res) => {
      return res;
    });
};

//GET DATA FROM SOURCE REST API (Retrieves data in JSON format from "source" api)
const fetchData = async (token, targetDate) => {
  if (!targetDate) targetDate = new Date().toISOString().split("T")[0];
  return axios
    .post(
      stellantisUrl,
      {
        startDate: `${targetDate}T01:00:00.843+00:00`,
        endDate: `${targetDate}T23:59:59.843+00:00`,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        httpsAgent,
      },
    )
    .then((res) => {
      return res;
    })
    .catch((err) => {
      throw err;
    });
};

//POST OBJECT TO DESTINATION (This creates the Lead instance into Pilot CRM)
const stCodes = ["CDO005S", "CDO002S"]; //Codes for Santiago dealers
const postData = async (leads) => {
  console.log(`Uploading leads...`);
  const processedLeads = {
    success: [],
    error: [],
  };
  for (let l of leads) {
    let params = {
      ...pilotParams,
      pilot_suborigin_id: stCodes.some(
        (item) => item == l.leadData.dealers[0]?.geoSiteCode,
      )
        ? subOriginCodes.st
        : subOriginCodes.sd,
      pilot_firstname: l.leadData.customer.firstname,
      pilot_lastname: l.leadData.customer.lastname,
      pilot_email: l.leadData.customer.email,
      pilot_cellphone: l.leadData.customer.personalMobilePhone,
      pilot_notes: l.leadData.comments || "",
      pilot_notificacions_opt_in_consent_flag:
        l.leadData.consents?.some((c) => c.consentValue == true) ?? false,
      pilot_product_of_interest: getModelByCode(
        l.leadData.interestProduct.lcdv,
      ),
    };

    let url = `${pilotUrl}${generateUrlParams(params)}`;

    try {
      await axios.post(url);
      console.log("Lead uploaded! --> ", l.gitId);

      processedLeads.success.push(l);
    } catch (error) {
      console.error(error);

      console.log(`Error on lead ${l.gitId}`);
      console.log(error.response.data.data);
      processedLeads.error.push(l);
    }
  }

  return processedLeads;
};

//COMPARE TO LOCAL DATA
const validateNewLeads = (leads, file) => {
  return new Promise((resolve, reject) => {
    ensureDataDir();
    fs.readFile(`${dataDir}/${file}`, (err, data) => {
      if (err) {
        console.log(err);

        reject(err);
      }

      const localLeads = JSON.parse(data);

      const newLeads = leads.filter(
        (nl) => localLeads.some((lcl) => lcl.gitId == nl.gitId) == false,
      );
      // console.log(newLeads.map((al) => al.gitId));
      //   console.log(newLeads.length);

      resolve({ localLeads, newLeads });
    });
  });
};

const createJsonFile = (name, data) => {
  return new Promise((resolve, reject) => {
    ensureDataDir();
    fs.writeFile(`${dataDir}/${name}`, JSON.stringify(data), (err) => {
      if (err) {
        console.error("Error writing file:", err);
        reject();
      } else {
        console.log("File processed successfully!");
        resolve();
      }
    });
  });
};

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

const formatDate = (date) => date.toISOString().split("T")[0];

const parseDate = (dateString) => new Date(`${dateString}T00:00:00.000Z`);

const addDays = (dateString, days) => {
  const date = parseDate(dateString);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
};

const getDateRange = (startDate, endDate) => {
  const dates = [];
  let current = parseDate(startDate);
  const end = parseDate(endDate);

  while (current <= end) {
    dates.push(formatDate(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
};

const readRunState = () => {
  return new Promise((resolve) => {
    if (!fs.existsSync(runStateFile)) {
      resolve(null);
      return;
    }

    fs.readFile(runStateFile, (err, data) => {
      if (err) {
        console.log("Error reading run state:", err);
        resolve(null);
        return;
      }

      try {
        const parsed = JSON.parse(data);
        resolve(parsed?.lastRunDate || null);
      } catch (error) {
        console.log("Error parsing run state:", error);
        resolve(null);
      }
    });
  });
};

const writeRunState = (lastRunDate) => {
  return new Promise((resolve, reject) => {
    fs.writeFile(runStateFile, JSON.stringify({ lastRunDate }), (err) => {
      if (err) {
        console.error("Error writing run state:", err);
        reject(err);
      } else {
        console.log("Run state modified!");

        resolve();
      }
    });
  });
};

const processDate = async (token, date) => {
  try {
    const res = await fetchData(token, date);
    console.log(`Data fetched successfully for ${date}!`);

    const leads = Array.isArray(res?.data?.message) ? res.data.message : [];

    if (leads.length === 0) {
      console.log(`No data was fetched for ${date}.`);
      return;
    }

    const filename = `leads-${date}.json`;
    ensureDataDir();

    //Validate if file doesn't exists
    if (!fs.existsSync(`${dataDir}/${filename}`)) {
      await createJsonFile(filename, leads);
      await postData(leads);
      return;
    }

    //validate if there are some new leads
    const { localLeads, newLeads } = await validateNewLeads(leads, filename);

    if (newLeads?.length > 0) {
      console.log(`New leads fetched...[${newLeads.length}]`);
      console.log("Preparing to post the new leads...");
      const { success, error } = await postData(newLeads);
      console.log("Local Database is up to date!");
      await createJsonFile(filename, [...localLeads, ...success]);
      if (error.length > 0) console.log("Leads not uploaded due to errors");
      console.log(error.map((l) => l.gitId).join("\n"));
    } else {
      console.log("Local Database is up to date!");
      console.log("No new leads where found. Nothing to update.");
    }
  } catch (err) {
    if (err.message?.includes("404")) {
      console.log(
        "No data was fetched from",
        stellantisUrl,
        "for the date",
        date,
      );
    } else {
      console.log(`Error fetching data from source ${err}`);
    }
  }
};

//MTc0OTAzNjM1OGZkdWp0
//MTc0OTAzNjM3NEMyVHNV
//MTc0OTA0MjMyMExyRVAy

//MAIN
const run = async () => {
  try {
    ensureDataDir();
    const tokenRes = await getToken();
    console.log("Token Received!");
    console.log("Feching Data from source...");

    const today = formatDate(new Date());
    const lastRunDate = await readRunState();
    const startDate = lastRunDate ? addDays(lastRunDate, 1) : today;

    if (parseDate(startDate) > parseDate(today)) {
      console.log("No dates to process.");
      await writeRunState(today);
      return;
    }

    const dates = getDateRange(startDate, today);

    for (const date of dates) {
      await processDate(tokenRes.data.access_token, date);
    }

    await writeRunState(today);
  } catch (err) {
    console.log(`Error getting the token ${err}`);
  }
};

run();
