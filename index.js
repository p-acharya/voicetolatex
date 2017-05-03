'use strict';

console.log('Loading function');

const doc = require('dynamodb-doc');

const dynamo = new doc.DynamoDB();
var AWS = require("aws-sdk");
AWS.config.update({
  region: "us-west-2",
  endpoint: "http://localhost:8000"
});
var docClient = new AWS.DynamoDB.DocumentClient();
var leng = 0;
dynamo.scan({ TableName: "VoiceToLatex" },
    function(err, data) {
        if (err) {
            console.log('reading dynamodb failed: '+err);
        }
        for (var i in data.Items) {
            leng += 1;
            var entry = data.Items[i];
            const katex = entry['katex'];
            console.log(JSON.stringify(entry));
        }
    });

/**
 * Demonstrates a simple HTTP endpoint using API Gateway. You have full
 * access to the request and response payload, including headers and
 * status code.
 *
 * To scan a DynamoDB table, make a GET request with the TableName as a
 * query string parameter. To put, update, or delete an item, make a POST,
 * PUT, or DELETE request respectively, passing in the payload to the
 * DynamoDB API as a JSON body.
 */

var recipes_dict = {};

var done = null;

exports.handler = (event, context, callback) => {
    //console.log('Received event:', JSON.stringify(event, null, 2));
    if(event.request != null && event.request.intent != null && event.request.intent.slots!= null && event.request.intent.slots.letter!= null && event.request.intent.slots.append!= null ){
        console.log("So it begins: " + event.request.intent.slots.letter.value);
        var letter = event.request.intent.slots.letter.value;
        var append = event.request.intent.slots.append.value;
        var speechOutput = "";
        if(letter.includes(" ")){
            letter = letter.split(" ");
        } else {
            console.log("The middle: " + letter);
        }
        var ap = "+";
        if(append === "minus"){
            ap = "-";
        } else if (append === "times"){
            ap = "*";
        } else if (append === "divided by"){
            ap = "/";
        }
        speechOutput = letter[0] + " " + ap + " " + letter[1];
        if(append === "over." || append === "over"){
            speechOutput = "\\frac{" + letter[0] + "}{" + letter[1] + "}";
        }
        dynamo.putItem({ TableName:"VoiceToLatex", Item : {index: leng.toString(), katex: speechOutput}}, function(err, data) {
            console.log("Acknowledged");
        });
        leng += 1;
        
    } else if (event.request != null && event.request.intent != null && event.request.intent.name === "IntegralIntent"){
        var intent = event.request.intent;
        var letter = intent.slots.letter.value;
        var expression = intent.slots.expression.value;
        var to_output = "You said the expression: Integral of " + expression + " d. " + letter[0] + " from " + letter[1] + " to " + letter[2] + ". Please say another expression to convert to Latex!";
        var sessionAttributes = {
            "speechOutput": to_output,
            "repromptText": to_output
        }
        var arr = expression.split(" ");
        for(var i = 0; i < arr.length; i++){
            console.log("item: " + arr[i]);
        }
        var to_place = "fillertext";
        if(arr != null && arr.length == 3 && arr[1] == "of"){
            var tmp1 = arr[0], tmp2 = arr[2];
            if(arr[0].length > 1){
                tmp1 = arr[0][0];
            }
            if(arr[2].length > 1){
                tmp2 = arr[2][0];
            }
            to_place = tmp1+"("+tmp2+")";
        }
        if(letter.includes(" ")){
            letter = letter.split(" ");
            for(i = 0; i < letter.length; i++){
                if(letter[i].length > 1){
                    letter[i] = letter[i].substring(0,1);
                }
            }
        }
        dynamo.putItem({ TableName:"VoiceToLatex", Item : {index: leng.toString(), katex: "\\int^{"+letter[2]+"}_{"+letter[1]+"} "+to_place+" d"+letter[0]}}, function(err, data) {
            console.log("validation");
        });
        leng += 1;
    }
    if (event.httpMethod) {
        console.log("it's an httpMethod");
        done = (err, res) => callback(null, {
            statusCode: err ? '400' : '200',
            body: err ? err.message : JSON.stringify(res),
            headers: {
                'Content-Type': 'application/json', 'Access-Control-Allow-Headers': 'x-requested-with',
                "Access-Control-Allow-Origin" : "*", "Access-Control-Allow-Credentials" : true,
            },
        });

        switch (event.httpMethod) {
            case 'DELETE':
                console.log("delete method");
                dynamo.deleteItem(JSON.parse(event.body), done);
                break;
            case 'GET':
                console.log("get method");
                dynamo.scan({ TableName: event.queryStringParameters.TableName }, done);
                break;
            case 'POST':
                console.log("post method");
                dynamo.putItem(JSON.parse(event.body), done);
                break;
            case 'PUT':
                console.log("put method");
                dynamo.updateItem(JSON.parse(event.body), done);
                break;
            default:
                console.log("default method");
                done(new Error(`Unsupported method "${event.httpMethod}"`));
        }
    } else {
        try {
            var tableName = "VoiceToLatex";
            dynamo.scan({ TableName: tableName },
                function(err, data) {
                    console.log("DynamoDB is functional. Contents:");
                    if (err) {
                        context.done('error','reading dynamodb failed: '+err);
                    }
                    for (var i in data.Items) {
                        var entry = data.Items[i];
                        const katex = entry['katex'];
                        console.log(JSON.stringify(entry));
                    }
                });
            
            if(event.session != null){
                console.log("event.session != null");
                if (event.session.new) {
                    console.log("event.session.new");
                    onSessionStarted({requestId: event.request.requestId}, event.session);
                }

                if (event.request.type === "LaunchRequest") {
                    console.log("LaunchRequest");
                    onLaunch(event.request,
                        event.session,
                        function callback(sessionAttributes, speechletResponse) {
                            context.succeed(buildResponse(sessionAttributes, speechletResponse));
                        });
                } else if (event.request.type === "IntentRequest") {
                    onIntent(event.request,
                        event.session,
                        function callback(sessionAttributes, speechletResponse) {
                            context.succeed(buildResponse(sessionAttributes, speechletResponse));
                        });
                } else if (event.request.type === "SessionEndedRequest") {
    
                    onSessionEnded(event.request, event.session);
                    context.succeed();
                }
            }
        } catch (e) {
            context.fail("Exception: " + e);
        }
    }
};


function onSessionStarted(sessionStartedRequest, session) {
    console.log("onSessionStarted requestId=" + sessionStartedRequest.requestId
        + ", sessionId=" + session.sessionId);
}

function onLaunch(launchRequest, session, callback) {
    console.log("onLaunch requestId=" + launchRequest.requestId
        + ", sessionId=" + session.sessionId);

    getWelcomeResponse(callback);
}

function onIntent(intentRequest, session, callback) {
    console.log("onIntent requestId=" + intentRequest.requestId
        + ", sessionId=" + session.sessionId);

    var intent = intentRequest.intent,
        intentName = intentRequest.intent.name;

    if (session.attributes && session.attributes.speechOutput && ("AMAZON.RepeatIntent" === intentName)) {
        handleRepeatRequest(intent, session, callback);
    }

    if (session.attributes) {
        if ("OperationIntent" === intentName) {
            console.log("onIntent has decided to pass over to handleOperationRequest");
            handleOperationRequest(intent, session, callback);
        } else if ("IntegralIntent" === intentName) {
            console.log("onIntent has decided to pass over to handleIntegralRequest");
            handleIntegralRequest(intent, session, callback);
        }
    } else {
        console.log("it seems there has been a problem");
    }
}

function onSessionEnded(sessionEndedRequest, session) {
    console.log("onSessionEnded requestId=" + sessionEndedRequest.requestId
        + ", sessionId=" + session.sessionId);
}

function getWelcomeResponse(callback) {
    var sessionAttributes = {},
        title = "Latex",
        speechOutput = "This is voice to latex. Say any math expression and we'll convert it for you.",
        repromptText = "Say something to convert to LaTeX",
        shouldEndSession = false;

    sessionAttributes = {
        "mainMenu": true,
        "speechOutput": speechOutput,
        "repromptText": repromptText
    };
    callback(sessionAttributes,
        buildSpeechletResponse(title, speechOutput, repromptText, shouldEndSession));
}

function handleOperationRequest(intent, session, callback) {
    var to_output = "";
    if(intent.slots && intent.slots.letter && intent.slots.append){
        var letter = intent.slots.letter.value;
        var append = intent.slots.append.value;
        var tableName = "VoiceToLatex";
        var len = 1775;
        dynamo.scan({ TableName: tableName },
            function(err, data) {
                console.log("this happened!!!!!!");
                if (err) {
                    console.log('reading dynamodb failed: '+err);
                }
                len = data.Items.length;
                console.log("length: "+ len);
                for (var i in data.Items) {
                    var entry = data.Items[i];
                    const katex = entry['katex'];
                    console.log(JSON.stringify(entry));
                    console.log("DONE");
                }
            });
        console.log("len: " + len);
        if(letter.includes(" ")){
            var letters = letter.split(" ");
            to_output = "You said the expression: " + letters[0] + " " + append + " " + letters[1] + ". Please say another expression to convert to Latex!";
        } else {
            to_output = "You said the expression: " + letter[0] + " " + append + " " + letter[1] + ". Please say another expression to convert to Latex!";
        }
    
        var params = {
            TableName: "VoiceToLatex",
            Item: {
                index: len,
                katex: to_output
            }
        };
    } else {
        to_output = "Something went dreadfully wrong";
    }
    var repromptText = "Say something to convert to LaTeX";
    
    var sessionAttributes = {
        "mainMenu": true,
        "speechOutput":  to_output,
        "repromptText": repromptText
    }
    var shouldEndSession = false;
    
    callback(sessionAttributes,
        buildSpeechletResponse(letter, to_output, to_output, shouldEndSession));
}

function handleIntegralRequest(intent, session, callback) {
    console.log("handleIntegralRequest(" + intent + ", " + session);
    var letter = intent.slots.letter.value;
    var expression = intent.slots.expression.value;
    console.log("expression: " + expression);
    if(letter.includes(" ")){
        letter = letter.split(" ");
    }
    var to_output = "You said the expression: Integral of " + expression + " d. " + letter[0] + " from " + letter[1] + " to " + letter[2] + ". Please say another expression to convert to Latex!";
    var sessionAttributes = {
        "mainMenu": true,
        "speechOutput": to_output,
        "repromptText": to_output
    }
    var shouldEndSession = false;
    console.log("checkpoint 1");
    callback(sessionAttributes,
        buildSpeechletResponse(letter, to_output, to_output, shouldEndSession));
}

function handleMainHelpRequest(intent, session, callback) {
    var title = "Recipe Assistant",
        speechOutput = "You can say the command find followed by any search terms. Similarly, you can say the phrase I'd like to make followed by any search terms. " +
            "To leave the app, say exit or quit.",
        shouldEndSession = false;
    callback(session.attributes, buildSpeechletResponse(title, speechOutput, speechOutput, shouldEndSession));
}

function handleStartIngredientsRequest(intent, session, callback) {
    session.attributes.startedIngredients = true;
    var speechOutput = "Bacon";
    callback(session.attributes, buildSpeechletResponse("Ingredients", speechOutput, speechOutput, false));
}

function handleFinishSessionRequest(intent, session, callback) {
    callback(session.attributes,
        buildSpeechletResponseWithoutCard("Good bye!", "", true));
}

function handleInvalidRequest(intent, session, callback) {
    var speechOutput = "That is not a valid command. Try again.",
        repromptText = "Try again.";
    callback(session.attributes, buildSpeechletResponseWithoutCard(speechOutput, repromptText, false));
}

function handleRepeatRequest(intent, session, callback) {
    callback(session.attributes,
        buildSpeechletResponseWithoutCard(session.attributes.speechOutput, session.attributes.repromptText, false));
}

function buildSpeechletResponse(title, output, repromptText, shouldEndSession) {
    return {
        outputSpeech: {
            type: "PlainText",
            text: output
        },
        card: {
            type: "Simple",
            title: title,
            content: output
        },
        reprompt: {
            outputSpeech: {
                type: "PlainText",
                text: repromptText
            }
        },
        shouldEndSession: shouldEndSession
    };
}

function buildSpeechletResponseWithoutCard(output, repromptText, shouldEndSession) {
    return {
        outputSpeech: {
            type: "PlainText",
            text: output
        },
        reprompt: {
            outputSpeech: {
                type: "PlainText",
                text: repromptText
            }
        },
        shouldEndSession: shouldEndSession
    };
}

function buildResponse(sessionAttributes, speechletResponse) {
    return {
        version: "1.0",
        sessionAttributes: sessionAttributes,
        response: speechletResponse
    };
}
    