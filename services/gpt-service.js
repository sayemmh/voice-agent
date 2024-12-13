require('colors');
const EventEmitter = require('events');
const OpenAI = require('openai');
const tools = require('../functions/function-manifest');
const fs = require('fs');
const path = require('path');

const availableFunctions = {};
tools.forEach((tool) => {
  let functionName = tool.function.name;
  availableFunctions[functionName] = require(`../functions/${functionName}`);
});

const openaikey = process.env.OPENAI_API_KEY;


class GptService extends EventEmitter {
  constructor() {
    super();
    this.openai = new OpenAI({ apiKey: openaikey });
    this.userContext = [{'role': 'system', 'content':''},{'role': 'assistant', 'content':''}];
    this.partialResponseIndex = 0;
    this.activeStreams = {};
  }

  setCallSid(callSid) {
    this.userContext.push({ 'role': 'system', 'content': `callSid: ${callSid}` });
  }

  // setUserContext(toNumber, payorName, NPI, patientFirstName, patientLastName, subscriberId, TIN, callbackNumber, dateOfBirth) {

  //   this.userContext.push({
  //     role: 'system',
  //     content: `Initiating an outbound call with the following details:
  //     To Number: ${toNumber},
  //     Payor Name: ${payorName},
  //     NPI: ${NPI},
  //     Patient Name: ${patientFirstName} ${patientLastName},
  //     Subscriber ID: ${subscriberId},
  //     TIN: ${TIN},
  //     Callback Number: ${callbackNumber},
  //     Date of Birth: ${dateOfBirth}.`
  //   });
    

  // // Add further guidance for the assistant
  //   this.userContext.push({
  //       role: 'system',
  //       content: `You should keep your response short, in 1-2 sentences. Make sure to verify the details before proceeding. Keep responses clear and concise.`
  //   });
     
  
  //   }
  loadPrompt(promptName, variables) {
    return new Promise((resolve, reject) => {
      // Path to the prompts folder
      const promptPath = path.join(__dirname, 'prompts', `${promptName}.txt`);

      // Read the prompt file
      fs.readFile(promptPath, 'utf8', (err, data) => {
        if (err) {
          return reject('Error reading prompt file');
        }

        // Replace placeholders with actual values from the variables object
        let filledPrompt = data;

        for (let key in variables) {
          // Replace {key} in the template with the value from the variables object
          const placeholder = `{${key}}`;
          const value = variables[key];
          filledPrompt = filledPrompt.replace(new RegExp(placeholder, 'g'), value);
        }

        resolve(filledPrompt);
      });
    });
  }

  // Modify setUserContext to use dynamic prompts
  async setUserContext(toNumber, payorName, NPI, patientFirstName, patientLastName, subscriberId, TIN, callbackNumber, dateOfBirth) {
    const variables = {
      toNumber,
      payorName,
      NPI,
      patientFirstName,
      patientLastName,
      subscriberId,
      TIN,
      callbackNumber,
      dateOfBirth
    };


    try {
      // Load the prompt template with variables
      const promptName = 'user_prompt'; // Assume you have a prompt template called 'user_call_details.txt' in the prompts folder
      const filledPrompt = await this.loadPrompt(promptName, variables);

      // Push the filled prompt to userContext
      this.userContext.push({
        role: 'system',
        content: filledPrompt
      });

      // Add further guidance for the assistant
      this.userContext.push({
        role: 'system',
        content: `You should keep your response short, in 1-2 sentences. Make sure to verify the details before proceeding. Keep responses clear and concise.`
      });

      console.log('User context set successfully');
    } catch (error) {
      console.error('Error setting user context:', error);
    }
  }

  validateFunctionArgs(args) {
    try {
      return JSON.parse(args);
    } catch (error) {
      console.log('Warning: Duplicate function arguments returned by OpenAI:', args);
      if (args.indexOf('{') != args.lastIndexOf('{')) {
        return JSON.parse(args.substring(args.indexOf(''), args.indexOf('}') + 1));
      }
    }
  }

  updateUserContext(name, role, text) {
    if (name !== 'user') {
      this.userContext.push({ 'role': role, 'name': name, 'content': text });
    } else {
      this.userContext.push({ 'role': role, 'content': text });
    }
  }

  async completion(text, interactionCount, role = 'user', name = 'user', maxTokens = 100) {
    this.updateUserContext(name, role, text);

    if (this.activeStreams[interactionCount]) {
      this.activeStreams[interactionCount].abort = true;
    }

    const controller = new AbortController();
    this.activeStreams[interactionCount] = controller;
    // Passo 1: Enviar a transcrição do usuário para o Chat GPT
    const stream = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: this.userContext,
      //tools: tools,
      stream: true,
      //max_tokens: 1000, // Define o número máximo de tokens
    });

    this.activeStreams[interactionCount] = { stream, abort: false };
    
    let completeResponse = '';
    let partialResponse = '';
    let finishReason = '';

    for await (const chunk of stream) {
      let content = chunk.choices[0]?.delta?.content || '';
      finishReason = chunk.choices[0].finish_reason;

      // Usamos completeResponse para userContext
      completeResponse += content;
      // Usamos partialResponse para fornecer um chunk para TTS
      partialResponse += content;
      // Emitir última resposta parcial e adicionar resposta completa ao userContext
      if ([' ', '.', ',', '?', '!', ';', ':', ' ', '-', '(', ')', '[', ']', '}', ' '].includes(content.trim().slice(-1)) || finishReason === 'stop') {
        const gptReply = {
          partialResponseIndex: this.partialResponseIndex,
          partialResponse
        };

        this.emit('gptreply', gptReply, interactionCount);
        this.partialResponseIndex++;
        partialResponse = '';
      }
    }
    this.userContext.push({ 'role': 'assistant', 'content': completeResponse });
    console.log(`GPT -> tamanho do user context: ${this.userContext.length}`.green);
    delete this.activeStreams[interactionCount];
  }

  // stop(interactionCount) {
  //   if (this.activeStreams[interactionCount]) {
  //     this.activeStreams[interactionCount].abort();
  //     delete this.activeStreams[interactionCount];
  //     console.log(`Stopping GPT service for interaction ${interactionCount}`);
  //   }
  // }
  stop(interactionCount) {
    if (this.activeStreams[interactionCount]) {
      const streamEntry = this.activeStreams[interactionCount];
      if (streamEntry.abort && typeof streamEntry.abort === 'function') {
        streamEntry.abort(); // Ensure abort is a function
      } else {
        console.warn(`Abort not found or not a function for interaction ${interactionCount}`);
      }
      delete this.activeStreams[interactionCount];
      console.log(`Stopping GPT service for interaction ${interactionCount}`);
    }
  }
  
}

module.exports = { GptService };