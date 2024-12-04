require('dotenv').config();
require('colors');

const express = require('express');
const ExpressWs = require('express-ws');

const { GptService } = require('./services/gpt-service');
const { StreamService } = require('./services/stream-service');
const { TranscriptionService } = require('./services/transcription-service');
const { TextToSpeechService } = require('./services/tts-service');
const { recordingService } = require('./services/recording-service');

const VoiceResponse = require('twilio').twiml.VoiceResponse;

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

// app.post('/incoming/:phonenumber', (req, res) => {
//   try {
//     const response = new VoiceResponse();
//     const connect = response.connect();
//     connect.stream({ url: `wss://${process.env.SERVER}/connection` });
  
//     res.type('text/xml');
//     res.end(response.toString());
//   } catch (err) {
//     console.log(err);
//   }
// });

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


app.ws('/connection', (ws) => {
  try {
    ws.on('error', console.error);
    // Filled in from start message
    let streamSid;
    let callSid;

    const gptService = new GptService();
    const streamService = new StreamService(ws);
    const transcriptionService = new TranscriptionService();
    const ttsService = new TextToSpeechService({});
  
    let marks = [];
    let interactionCount = 0;
  
    // Incoming from MediaStream
    ws.on('message', function message(data) {
      const msg = JSON.parse(data);
      if (msg.event === 'start') {
        streamSid = msg.start.streamSid;
        callSid = msg.start.callSid;
        
        streamService.setStreamSid(streamSid);
        gptService.setCallSid(callSid);

        // Set RECORDING_ENABLED='true' in .env to record calls
        recordingService(ttsService, callSid).then(() => {
          console.log(`Twilio -> Starting Media Stream for ${streamSid}`.underline.red);
          ttsService.generate({partialResponseIndex: null, partialResponse: 'Hello! I understand you\'re looking for a pair of AirPods, is that correct?'}, 0);
        });
      } else if (msg.event === 'media') {
        transcriptionService.send(msg.media.payload);
      } else if (msg.event === 'mark') {
        const label = msg.mark.name;
        console.log(`Twilio -> Audio completed mark (${msg.sequenceNumber}): ${label}`.red);
        marks = marks.filter(m => m !== msg.mark.name);
      } else if (msg.event === 'stop') {
        console.log(`Twilio -> Media stream ${streamSid} ended.`.underline.red);
      }
    });
  
    transcriptionService.on('utterance', async (text) => {
      // This is a bit of a hack to filter out empty utterances
      if(marks.length > 0 && text?.length > 5) {
        console.log('Twilio -> Interruption, Clearing stream'.red);
        ws.send(
          JSON.stringify({
            streamSid,
            event: 'clear',
          })
        );
      }
    });
  
    transcriptionService.on('transcription', async (text) => {
      if (!text) { return; }
      console.log(`Interaction ${interactionCount} – STT -> GPT: ${text}`.yellow);
      gptService.completion(text, interactionCount);
      interactionCount += 1;
    });
    
    gptService.on('gptreply', async (gptReply, icount) => {
      console.log(`Interaction ${icount}: GPT -> TTS: ${gptReply.partialResponse}`.green );
      ttsService.generate(gptReply, icount);
    });
  
    ttsService.on('speech', (responseIndex, audio, label, icount) => {
      console.log(`Interaction ${icount}: TTS -> TWILIO: ${label}`.blue);
  
      streamService.buffer(responseIndex, audio);
    });
  
    streamService.on('audiosent', (markLabel) => {
      marks.push(markLabel);
    });
  } catch (err) {
    console.log(err);
  }
});

app.listen(PORT);
console.log(`Server running on port ${PORT}`);
