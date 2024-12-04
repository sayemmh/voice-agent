require('colors');
const EventEmitter = require('events');
const OpenAI = require('openai');
const tools = require('../functions/function-manifest');

// Import all functions included in function manifest
// Note: the function name and file name must be the same
const availableFunctions = {};
tools.forEach((tool) => {
  let functionName = tool.function.name;
  availableFunctions[functionName] = require(`../functions/${functionName}`);
});

class GptService extends EventEmitter {
  constructor() {
    super();
    this.openai = new OpenAI();
    this.userContext = [
      { 'role': 'system', 'content': 'You are an outbound sales representative selling Apple Airpods. You have a youthful and cheery personality. Keep your responses as brief as possible but make every attempt to keep the caller on the phone without being rude. Don\'t ask more than 1 question at a time. Don\'t make assumptions about what values to plug into functions. Ask for clarification if a user request is ambiguous. Speak out all prices to include the currency. Please help them decide between the airpods, airpods pro and airpods max by asking questions like \'Do you prefer headphones that go in your ear or over the ear?\'. If they are trying to choose between the airpods and airpods pro try asking them if they need noise canceling. Once you know which model they would like ask them how many they would like to purchase and try to get them to place an order. You must add a \'•\' symbol every 5 to 10 words at natural pauses where your response can be split for text to speech.' },
      { 'role': 'assistant', 'content': 'Hello! I understand you\'re looking for a pair of AirPods, is that correct?' },
    ],
    this.partialResponseIndex = 0;
  }

  // Add the callSid to the chat context in case
  // ChatGPT decides to transfer the call.
  // setCallSid (callSid) {
  //   this.userContext.push({ 'role': 'system', 'content': `callSid: ${callSid}` });
  // }
  setUserContext(content, todo, notodo, avaliable_times_info, fullname, ai_profile_name) {
    this.userContext.push({ 'role': 'system', 'content': `Use this script to engage in conversations with your users: '${content}'.
    You should provide accurate contact information, such as name, company, position, etc.` });
    this.userContext.push({ 'role': 'system', 'content': `You should keep your response short, in 1-2 sentences. You should speak only in Portuguese (Brazil) and the entire conversation should sound like a real human being so talk like one. ${todo}` }); this.userContext.push({ 'role': 'system', 'content': `You should never say 'symbols' like '[], {}, #'. You should never say "AirPods".
    Do not use words like um, ahh, ehh, yea, umm, hmm. When you say the date, you should say the month, day, hour, and minute. Do not say the day of the week.
    For example, instead of saying "it's Friday at 10:00 AM", if Friday is August 3rd, say "it's August 3rd at 10:00 AM".
    Do not repeat your answers and do not repeat questions unless asked to please repeat. Always wait for the answer to the question before continuing.
    You should never make a sound that is boring or that is not a human sound.
    Never repeat questions at the beginning ${notodo}` });
    this.userContext.push({ 'role': 'system', 'content': `The name user's name is ${fullname} and their name is ${ai_profile_name}` });
    this.userContext.push({ 'role': 'system', 'content': `${avaliable_times_info} you can suggest two options to the user to schedule using these available times. But we need to offer the user 3 hours less.
    For example, if 10 am on August 5th and 5 pm on August 7th were selected, the times you would use for conversations would be 7 am on August 5th and 2 pm on August 7th.
    Also, the time must be between 9:00 am and 7:00 pm.
    In this case, when providing the date, you should provide the month, day, hour, minute.` });
    }

  validateFunctionArgs (args) {
    try {
      return JSON.parse(args);
    } catch (error) {
      console.log('Warning: Double function arguments returned by OpenAI:', args);
      // Seeing an error where sometimes we have two sets of args
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

  async completion(text, interactionCount, role = 'user', name = 'user') {
    this.updateUserContext(name, role, text);

    // Step 1: Send user transcription to Chat GPT
    const stream = await this.openai.chat.completions.create({
      model: 'gpt-4-1106-preview',
      messages: this.userContext,
      tools: tools,
      stream: true,
    });

    let completeResponse = '';
    let partialResponse = '';
    let functionName = '';
    let functionArgs = '';
    let finishReason = '';

    function collectToolInformation(deltas) {
      let name = deltas.tool_calls[0]?.function?.name || '';
      if (name != '') {
        functionName = name;
      }
      let args = deltas.tool_calls[0]?.function?.arguments || '';
      if (args != '') {
        // args are streamed as JSON string so we need to concatenate all chunks
        functionArgs += args;
      }
    }

    for await (const chunk of stream) {
      let content = chunk.choices[0]?.delta?.content || '';
      let deltas = chunk.choices[0].delta;
      finishReason = chunk.choices[0].finish_reason;

      // Step 2: check if GPT wanted to call a function
      if (deltas.tool_calls) {
        // Step 3: Collect the tokens containing function data
        collectToolInformation(deltas);
      }

      // need to call function on behalf of Chat GPT with the arguments it parsed from the conversation
      if (finishReason === 'tool_calls') {
        // parse JSON string of args into JSON object

        const functionToCall = availableFunctions[functionName];
        const validatedArgs = this.validateFunctionArgs(functionArgs);
        
        // Say a pre-configured message from the function manifest
        // before running the function.
        const toolData = tools.find(tool => tool.function.name === functionName);
        const say = toolData.function.say;

        this.emit('gptreply', {
          partialResponseIndex: null,
          partialResponse: say
        }, interactionCount);

        let functionResponse = await functionToCall(validatedArgs);

        // Step 4: send the info on the function call and function response to GPT
        this.updateUserContext(functionName, 'function', functionResponse);
        
        // call the completion function again but pass in the function response to have OpenAI generate a new assistant response
        await this.completion(functionResponse, interactionCount, 'function', functionName);
      } else {
        // We use completeResponse for userContext
        completeResponse += content;
        // We use partialResponse to provide a chunk for TTS
        partialResponse += content;
        // Emit last partial response and add complete response to userContext
        if (content.trim().slice(-1) === '•' || finishReason === 'stop') {
          const gptReply = { 
            partialResponseIndex: this.partialResponseIndex,
            partialResponse
          };

          this.emit('gptreply', gptReply, interactionCount);
          this.partialResponseIndex++;
          partialResponse = '';
        }
      }
    }
    this.userContext.push({'role': 'assistant', 'content': completeResponse});
    console.log(`GPT -> user context length: ${this.userContext.length}`.green);
  }
}

module.exports = { GptService };
