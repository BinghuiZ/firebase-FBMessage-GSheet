const functions = require('firebase-functions');
const mainFunction = require('./function')

// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
//
// exports.helloWorld = functions.https.onRequest((request, response) => {
//   functions.logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

exports.getComments = functions.region('asia-east2').https.onRequest((request, response) => {
    let pathValues = request.path.split('/')
    if (pathValues != null && pathValues != 'undefined') {
        if (pathValues.length > 0) {
            let postId = pathValues[1]
            mainFunction.main2(postId)
            functions.logger.log(`call get Comments success with post Id ${postId}`)
            response.send(`called Main2 function with post Id ${postId}`)
        } else {
            response.end()
        }
    } else {
        functions.logger.log('call get Comments failed')
        response.end()
    }
})

exports.updateMappingTable = functions.region('asia-east2').https.onRequest((request, response) => {
    mainFunction.main()
    functions.logger.log('shoppingDaddy function called')
    response.send('shoppingDaddy function called')
})

