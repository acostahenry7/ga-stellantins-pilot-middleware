const credentials = {
  clientId: process.env.STELLANTIS_CLIENT_ID,
  clientSecret: process.env.STELLANTIS_CLIENT_SECRET,
  grantType: process.env.STELLANTIS_GRANT_TYPE,
  username: process.env.STELLANTIS_USERNAME,
  password: process.env.STELLANTIS_PASSWORD,
};

const pilotParams = {
  action: process.env.PILOT_ACTION,
  appkey: process.env.PILOT_APPKEY,
  pilot_contact_type_id: process.env.PILOT_CONTACT_TYPE_ID,
  pilot_contact_type_code: process.env.PILOT_CONTACT_TYPE_CODE,
  pilot_business_type_id: process.env.PILOT_BUSINESS_TYPE_ID,
  pilot_business_type_code: process.env.PILOT_BUSINESS_TYPE_CODE,
  //pilot_business_type_code: " Citroen",
};

console.log(pilotParams);

module.exports = {
  credentials,
  pilotParams,
};
