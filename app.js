require("dotenv").config();
require("colors");

const express = require("express");
const ExpressWs = require("express-ws");
const bodyParser = require("body-parser");
const { chromium } = require("playwright");
const WebSocket = require("ws");
const { GptService } = require("./services/gpt-service");
const  {GptService_Incoming} = require("./services/gpt-service-incoming")
const { StreamService } = require("./services/stream-service");
const { TranscriptionService } = require("./services/transcription-service");
const { TextToSpeechService } = require("./services/tts-service");
const { recordingService } = require("./services/recording-service");
const cors = require("cors");
const { chatGpt, getData_Calendly } = require("./services/checkschedule");
const { get_Avaliable_time } = require("./services/getAvaliableTime");
const { makeschedule } = require("./services/make-schedule");
const makeCallRouter = require("./makeCall");
const VoiceResponse = require("twilio").twiml.VoiceResponse;

const fs = require('fs');
var phonenumberlist;
var contact_id = "";
var campaign_id = "";
var avaliable_times_info;
var ai_profile_name = "Brandon";
var fullname = "Elina";
var voiceId;

var content = "";
var todo = "";
var notodo = "";
var email = "";
var company = "";
var contact_company = "";
var contact_position = "";
var stability = "";
var style_exaggeration = "";
var similarity_boost = "";
var phonenumber = "";
var calendarlink = "";
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = require("twilio")(accountSid, authToken);
const twilio = require('twilio');

const app = express();
ExpressWs(app);

const PORT = process.env.PORT || 3000;
app.use(
  cors({
    origin: "https://saleup.com.br",
  })
);
app.use(bodyParser.json());
app.use("/api", makeCallRouter);

console.log(process.env.TWILIO_ACCOUNT_SID);

const options = {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  hour12: false,
};
const formatter = new Intl.DateTimeFormat([], options);
const brazilHour = parseInt(formatter.format(new Date()), 10);

let timeOfDay;
if (brazilHour >= 5 && brazilHour < 12) {
  timeOfDay = "Good morning!";
} else if (brazilHour >= 12 && brazilHour < 18) {
  timeOfDay = "Good afternoon!";
} else {
  timeOfDay = "Goodnight!";
}



app.post('/incoming/:phonenumber', (req, res) => {

  phonenumber = req.params.phonenumber; 

  console.log(`Recieved: ${phonenumber}`);


  if (phonenumber) {
    const filePath = `./support/${phonenumber}.txt`;
    console.log(`filePath : ${filePath}`)


    // ... existing code ...
    if (fs.existsSync(filePath)) {
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const contactData = JSON.parse(fileContent);


      todo = contactData.todo;
      notodo = contactData.notodo;
      // fullname = contactData.fullname;
      ai_profile_name = contactData.ai_profile_name;
      email = contactData.email;
      company = contactData.company;
      contact_position = contactData.contact_position;
      contact_company = contactData.contact_company;
      contact_id = contactData.contact_id;
      voiceId = contactData.voiceId;
      style_exaggeration = contactData.style_exaggeration;
      stability = contactData.stability;
      similarity_boost = contactData.similarity_boost;
      calendarlink = contactData.calendarlink;
      campaign_id = contactData.campaign_id;
      content = fs.readFileSync(`./support/${phonenumber}_content.txt`, 'utf8'); 
      console.log(`Content_content : ${content}`);
    }
    
     else {
      console.error(`File  not found.`);
      res.status(404).send('Contact file not found');
      return;
    }

    try {
      callstatus = "Not answered";
      const response = new VoiceResponse();
      const connect = response.connect();
      const uniqueConnectionId = `${phonenumber}-${Date.now()}`; // Unique identifier
      connect.stream({ url: `wss://${process.env.SERVER}/realtime` });
      res.type("text/xml");
      res.end(response.toString());
    } catch (err) {
      console.log(err);
    }
  }

   else {
    twiml.say('Hello good');
  }
});

app.post("/outcoming", async (req, res) => {
  const avaliable_times = await get_Avaliable_time();
  avaliable_times_info = `Avaliable times to schedule: "${avaliable_times}"`;
  console.log(`avaliable_times_info : ${avaliable_times_info}`);
  
  if (true || fs.existsSync(filePath)) {
  
    toNumber = req.query.toNumber;
    payorName = req.query.payorName;
    NPI = req.query.NPI;
    patientFirstName = req.query.patientFirstName;
    patientLastName = req.query.patientLastName;
    subscriberId = req.query.subscriberId;
    TIN = req.query.TIN;
    callbackNumber = req.query.callbackNumber;
    dateOfBirth = req.query.dateOfBirth;

  } else {
    console.error(`File  not found.`);
    res.status(404).send('Contact file not found');
    return;
  }
  
  try {

  
    callstatus = "Not answered";
    const response = new VoiceResponse();
    const connect = response.connect();
    const uniqueConnectionId = `${phonenumber}-${Date.now()}`; // Unique identifier
    connect.stream({ url: `wss://${process.env.SERVER}/connection` });
    console.log(connect)
    res.type("text/xml");
    res.end(response.toString());
    console.log(process.env.SERVER)
    
  } catch (err) {
    console.log(err);
  }
});

app.ws("/connection", (ws) => {
  console.log('connected')
  var communicationtext = "";
  console.log("connection");
  try {
    ws.on("error", console.error);

    let streamSid;
    let callSid;
    let currentIcount = 0;

    const gptService = new GptService();
    const streamService = new StreamService(ws);
    const transcriptionService = new TranscriptionService();
    const ttsService = new TextToSpeechService({});
    let marks = [];
    let interactionCount = 0;
    var contact;
    contact = {
      name: fullname,
      position: contact_position,
      company: contact_company,
    };

    //    Incoming from MediaStream
    ws.on("message", async function message(data) {
      const msg = JSON.parse(data);
      if (msg.event === "start" && msg.start && msg.start.streamSid) {
        console.log("start");
        streamSid = msg.start.streamSid;
        callSid = msg.start.callSid;
        // console.log(`Received phonenumber: ${re_phonenumber}`);
        console.log(streamSid);
        streamService.setStreamSid(streamSid);
        gptService.setCallSid(callSid);
        gptService.setUserContext(toNumber, payorName, NPI, patientFirstName, patientLastName, subscriberId, TIN, callbackNumber, dateOfBirth)
        ttsService.generate(
          {
            partialResponseIndex: null,
            // partialResponse: `Hello, ${fullname}. ${timeOfDay} I see you work for ${contact_company}. Are you still responsible for ${contact_position}?`,
            partialResponse:`Hello, This is a helpful assistant from your doctor office. How can I assist you today?`
          },
          0,
          
        );
        // Set RECORDING_ENABLED='true' in .env to record calls
        recordingService(ttsService, callSid).then(() => {
          console.log(
            `Twilio -> Starting Media Stream for ${streamSid}`.underline.red
          );
        });
      } else if (msg.event === "media") {
        transcriptionService.send(msg.media.payload);
      } else if (msg.event === "mark") {
        const label = msg.mark.name;
        console.log(
          `Twilio -> Audio completed mark (${msg.sequenceNumber}): ${label}`.red
        );
        marks = marks.filter((m) => m !== msg.mark.name);
      } else if (msg.event === "stop") {
        console.log(`Twilio -> Media stream ${streamSid} ended.`.underline.red);
        // console.log(`Context : ${communicationtext}`);
      }
    });

    transcriptionService.on("utterance", async (text) => {
      if (marks.length > 0 && text?.length > 5) {
        console.log("Twilio -> Interruption, Clearing stream".red);
        ws.send(
          JSON.stringify({
            streamSid,
            event: "clear",
          })
        );
      }
    });

    transcriptionService.on("transcription", async (text) => {
      if (!text) {
        return;
      }
      if (text.includes("UtteranceEnd")) {
        hangUpCall(callSid);
      }
      console.log(
        `Interaction ${interactionCount} : STT -> GPT: ${text}`.yellow
      );
      // console.log(`phonenumber : ${re_phonenumber}`);
      communicationtext += `Contact: ${text}\n`;

      if (interactionCount !== currentIcount) {
        gptService.stop(currentIcount);
        currentIcount = interactionCount;
      }

      gptService.completion(text, interactionCount);
      interactionCount += 1;
    });

    gptService.on("gptreply", async (gptReply, icount) => {
      console.log(
        `Interaction ${icount}: GPT -> TTS: ${gptReply.partialResponse}`.green
      );
      

    
      ttsService.generate(gptReply, icount);
    });

    ttsService.on("speech", (responseIndex, audio, label, icount) => {
      console.log(`Interaction ${icount}: TTS -> TWILIO: ${label}`.blue);
      communicationtext += ` Ai-agent: ${label}\n`;
      streamService.buffer(responseIndex, audio);
    });
    streamService.on("audiosent", (markLabel) => {
      marks.push(markLabel);
    });
  } catch (err) {
    console.log(err);
  }
});

app.ws("/connection_incoming", (ws) => {
  var _contactID = contact_id;
  var _campaignID = campaign_id;
  var callstatus = "";
  var communicationtext = "";
  const re_phonenumber = phonenumber;
  var contact_email = email;
  var _voiceId = voiceId;
  var recordingSid = '';
  var recordingUrl = '';
  console.log("connection");
  try {
    ws.on("error", console.error);
    ws.on("close", async () => {
      try {
        callstatus = await chatGpt(communicationtext);
        
        await client.recordings
          .list({ callSid: callSid }) // Replace with your actual callSid
          .then((recordings) => {
            return Promise.all(recordings.map((recording) => {
              console.log(`Recording SID: ${recording.sid}`); 
              console.log('--------------Recording Url:', recording.uri); // This is your recordingSid
              recordingSid = recording.sid;

              return client.recordings(recordingSid)
                .fetch()
                .then(recording => {
                  recordingUrl = `https://api.twilio.com${recording.uri.replace('.json', '.mp3')}`;
                  console.log(recordingUrl);
                });
            }));
          })
          .catch((error) => console.error(error));

        await updateData(communicationtext, _contactID, _campaignID, callstatus, recordingUrl);
        const schedule_date_time = await getData_Calendly(
          callstatus,
          calendarlink
        );
        console.log(callstatus);
        console.log(schedule_date_time);
        makeschedule(schedule_date_time, _full_name, contact_email);
      } catch (error) {
        console.error("Error processing stop event:", error);
      }
    });

    let streamSid;
    let callSid;
    let currentIcount = 0;

    const gptService = new GptService_Incoming();
    const streamService = new StreamService(ws);
    const transcriptionService = new TranscriptionService();
    const ttsService = new TextToSpeechService({});
    let marks = [];
    let interactionCount = 0;
    var contact;
    contact = {
      position: contact_position,
      company: contact_company,
    };

    //    Incoming from MediaStream
    ws.on("message", async function message(data) {
      const msg = JSON.parse(data);
      if (msg.event === "start" && msg.start && msg.start.streamSid) {
        console.log("start");
        streamSid = msg.start.streamSid;
        callSid = msg.start.callSid;
        console.log(`Received phonenumber: ${re_phonenumber}`);
        console.log(streamSid);
        streamService.setStreamSid(streamSid);
        gptService.setCallSid(callSid);
        gptService.setUserContext(
          content,
          todo,
          notodo,
          avaliable_times_info,
        );
        ttsService.generate(
          {
            partialResponseIndex: null,
            partialResponse: `Olá, ${timeOfDay}`,
          },
          0,
          _voiceId,
          stability,
          similarity_boost,
          style_exaggeration
        );
        recordingService(ttsService, callSid).then(() => {
          console.log(
            `Twilio -> Starting Media Stream for ${streamSid}`.underline.red
          );
        });
      } else if (msg.event === "media") {
        transcriptionService.send(msg.media.payload);
      } else if (msg.event === "mark") {
        const label = msg.mark.name;
        console.log(
          `Twilio -> Audio completed mark (${msg.sequenceNumber}): ${label}`.red
        );
        marks = marks.filter((m) => m !== msg.mark.name);
      } else if (msg.event === "stop") {
        console.log(`Twilio -> Media stream ${streamSid} ended.`.underline.red);
        console.log(`Context : ${communicationtext}`);
      }
    });

    transcriptionService.on("utterance", async (text) => {
      if (marks.length > 0 && text?.length > 5) {
        console.log("Twilio -> Interruption, Clearing stream".red);
        ws.send(
          JSON.stringify({
            streamSid,
            event: "clear",
          })
        );
      }
    });

    transcriptionService.on("transcription", async (text) => {
      if (!text) {
        return;
      }
      if (text.includes("UtteranceEnd")) {
        hangUpCall(callSid);
      }
      console.log(
        `Interaction ${interactionCount} : STT -> GPT: ${text}`.yellow
      );
      console.log(`phonenumber : ${re_phonenumber}`);
      communicationtext += `Contact: ${text}\n`;

      if (interactionCount !== currentIcount) {
        gptService.stop(currentIcount);
        currentIcount = interactionCount;
      }

      gptService.completion(text, interactionCount);
      interactionCount += 1;
    });

    gptService.on("gptreply", async (gptReply, icount) => {
      console.log(
        `Interaction ${icount}: GPT -> TTS: ${gptReply.partialResponse}`.green
      );
      // if (icount !== currentIcount) {
      //   ttsService.stop(currentIcount);
      //   currentIcount = icount;
      // }

      ttsService.generate(
        gptReply,
        icount,
        _voiceId,
        stability,
        similarity_boost,
        style_exaggeration
      );
    });

    ttsService.on("speech", (responseIndex, audio, label, icount) => {
      console.log(`Interaction ${icount}: TTS -> TWILIO: ${label}`.blue);
      communicationtext += ` Ai-agent: ${label}\n`;
      streamService.buffer(responseIndex, audio);
    });
    streamService.on("audiosent", (markLabel) => {
      marks.push(markLabel);
    });
  } catch (err) {
    console.log(err);
  }
});

function hangUpCall(callSid) {
  client
    .calls(callSid)
    .update({ status: "completed" })
    .then((call) => console.log(`Call ${call.sid} ended`));
}

function updateData(communicationtext, contact_id, campaign_id, callstatus, recordingUrl) {
  console.log("transforming call-status to Client")
  console.log(`RecordingUrl : ${recordingUrl}`)
  fetch("https://saleup.com.br/api/1.1/wf/update-data", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      eventType: communicationtext,
      contactID: contact_id,
      campaign_id: campaign_id,
      callstatus: callstatus,
      recordingUrl: recordingUrl 
    }),
  })
    .then((response) => response.json())
    .then((data) => {
      console.log("Success:", data);
    })
    .catch((error) => {
      console.error("Error:", error);
    });
}

const url = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01";
let ws;

app.ws("/realtime", (ws, req) => {
  console.log("Twilio WebSocket connection established");

  const openAIRealtimeUrl = "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01";
  const openAIWs = new WebSocket(openAIRealtimeUrl, {
    headers: {
      "Authorization": "Bearer " + process.env.OPENAI_API_KEY,
      "OpenAI-Beta": "realtime=v1",
    },
  });

  openAIWs.on("open", () => {
    console.log("Connected to OpenAI Realtime API");
  });

  openAIWs.on("message", (message) => {
    const response = JSON.parse(message.toString());
    console.log("OpenAI response received:", response);

    // Send OpenAI response back to Twilio
    if (response.audio) {
      ws.send(JSON.stringify({
        event: "media",
        media: {
          payload: response.audio, // Assuming OpenAI sends an audio response
        }
      }));
    }
  });

  ws.on("message", (data) => {
    const msg = JSON.parse(data);
    if (msg.event === "media") {
      console.log("Media received from Twilio:", msg.media.payload);

      // Append audio data to OpenAI
      openAIWs.send(JSON.stringify({
        type: "input_audio_buffer.append",
        data: msg.media.payload
      }));

     
    }
  });

  ws.on("close", () => {
    console.log("Twilio WebSocket connection closed");
    openAIWs.close();
  });

  ws.on("error", (err) => {
    console.error("Twilio WebSocket error:", err);
  });
});

function connect() {
  const ws = new WebSocket(url, {
      headers: {
          "Authorization": "Bearer " + process.env.OPENAI_API_KEY,
          "OpenAI-Beta": "realtime=v1",
      },
  });

  ws.on("open", function open() {
      console.log("Connected to server.");
      ws.send(JSON.stringify({
          type: "response.create",
          response: {
              modalities: ['audio', 'text'],
              instructions: "Please assist the user.",
          }
      }));
  });

  ws.on("message", function incoming(message) {
      console.log("Received message:", JSON.parse(message.toString()));
  });

  ws.on("close", function close() {
      console.log("Connection closed. Reconnecting...");
      setTimeout(connect, 1000); // Attempt to reconnect after 1 second
  });

  ws.on("error", function error(err) {
      console.error("WebSocket error:", err);
  });
}
app.listen(PORT);
console.log(`Server running on port ${PORT}`);

