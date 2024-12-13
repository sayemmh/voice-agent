const express = require('express');
const router = express.Router();
const { get_Avaliable_time } = require('./services/getAvaliableTime');
const { chatGpt, getData_Calendly } = require('./services/checkschedule');
const { makeschedule } = require('./services/make-schedule');
const fs = require('fs');
const path = require('path');

router.post


  router.post('/make-call', async (req, res) => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const client = require('twilio')(accountSid, authToken);
  
  const toNumber = req.query.toNumber;
  const payorName = req.query.payorName;
  const NPI = req.query.NPI;
  const patientFirstName = req.query.patientFirstName;
  const patientLastName = req.query.patientLastName;
  const subscriberId = req.query.subscriberId;
  const TIN = req.query.TIN;
  const callbackNumber = req.query.callbackNumber;
  const dateOfBirth = req.query.dateOfBirth;


  const scriptsDir = path.join(__dirname, 'scripts');


  try {

        // const call = await client.calls.create({
        //     // url: `https://${process.env.SERVER}/outcoming?phonenumber=phonenumber&prompt=prompt`,
        //     url: `https://${process.env.SERVER}/outcoming?phonenumber=${encodeURIComponent(phonenumber)}&prompt=${encodeURIComponent(prompt)}`,
        //     to: phonenumber, // Use matched phonenumber
        //     from: process.env.FROM_NUMBER,
        //     record: true,
        //     method: 'POST'
        //   });
          const call = await client.calls.create({
            url: `https://${process.env.SERVER}/outcoming` +
              `?toNumber=${encodeURIComponent(req.query.toNumber)}` +
              `&payorName=${encodeURIComponent(req.query.payorName)}` +
              `&NPI=${encodeURIComponent(req.query.NPI)}` +
              `&patientFirstName=${encodeURIComponent(req.query.patientFirstName)}` +
              `&patientLastName=${encodeURIComponent(req.query.patientLastName)}` +
              `&subscriberId=${encodeURIComponent(req.query.subscriberId)}` +
              `&TIN=${encodeURIComponent(req.query.TIN)}` +
              `&callbackNumber=${encodeURIComponent(req.query.callbackNumber)}` +
              `&dateOfBirth=${encodeURIComponent(req.query.dateOfBirth)}`,
            to: req.query.toNumber, // Use the matched toNumber
            from: process.env.FROM_NUMBER,
            record: true,
            method: 'POST',
          });
          
      console.log(call.sid);

      return call.sid;


    const callSids = await Promise.all(callPromises);
    res.status(200).send(`Calls initiated with SIDs: ${callSids.join(', ')}`);
  } catch (error) {
    console.error(error);
    res.status(500).send('Failed to initiate calls');
  }
});

module.exports = router;