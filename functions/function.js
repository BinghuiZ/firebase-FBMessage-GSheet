const FB = require('fb')
const fs = require('fs');
const readline = require('readline');
const { google } = require('googleapis');
const async = require('async')
const axios = require('axios')
const functions = require('firebase-functions');

const Utils = require('./utils');

const accessToken = '{Facebook-accessToken}'

// test1 fb access token
const pageId = '{Facebook-pageId}}'

const SCOPES = [
    'https://www.googleapis.com/auth/drive'
];

const TOKEN_PATH = '{GoogleAPI-token.json}}'
const CREDENTIAL_PATH = '{GoogleAPI-credentials.json}'

/** Begin of Facebook part */
FB.setAccessToken(accessToken)
FB.options({ version: 'v8.0' })

const listAllFBPosts = () => {
    return new Promise((resolve, reject) => {
        FB.api(`/${pageId}/posts`, { fields: ['created_time', 'id', 'message', 'permalink_url'], limit: 10 }, (res) => {
            if (!res || res.error) {
                reject('list FB posts: ', !res ? 'error occurred' : res.error)
            }

            resolve(res)
        })
    })
}

const getPostData = (page_postId) => {
    // , 'comments{id, created_time, permalink_url, from, message}'
    return new Promise((resolve, reject) => {
        FB.api(`/${page_postId}/`, { fields: ['id', 'created_time', 'message', 'permalink_url'] }, (res) => {
            if (!res || res.error) {
                reject('list FB posts: ', !res ? 'error occurred' : res.error)
            }

            resolve(res)
        })
    })
}

const listComments = (page_postId) => {
    return new Promise((resolve, reject) => {
        FB.api(`/${page_postId}/comments`, { fields: ['id', 'created_time', 'permalink_url', 'message', 'from'], limit: 100 }, async (res) => {
            try {
                if (!res || res.error) {
                    console.log('list FB comments: ', !res ? 'error occurred' : res.error)
                    reject('list FB comments: ', !res ? 'error occurred' : res.error)
                }
    
                // first next page
                if (res.paging != null && res.paging != 'undefined') {
                    if (res.paging.next != null && res.paging.next != 'undefined') {
                        let commentArray = await getCommentsFromAxios(res.paging.next)
                        res.data = res.data.concat(commentArray)
                    }
                }
    
    
                resolve(res.data)
            } catch (error) {
                reject(error)
            }
        })
    })
}

const getCommentsFromAxios = (url) => {
    // console.log('from axios method',url)
    return new Promise(async (resolve, reject) => {
        try {
            let response = await axios.get(url)
            let data = []

            if (response != null) {
                data = data.concat(response.data.data)

                if (response.data.paging != null && response.data.paging != 'undefined') {
                    if (response.data.paging.next != null && response.data.paging.next != 'undefined') {
                        let result = await getCommentsFromAxios(response.data.paging.next)
                        data = data.concat(result)
                    }
                }
            }

            resolve(data)
        } catch (error) {
            console.log('from axios :   ', error)
            reject(error)
        }
    })
}
/** End of Facebook part */

/** Begin Google Part */
const getGoogleAuth = () => {
    return new Promise((resolve, reject) => {
        fs.readFile(CREDENTIAL_PATH, async (err, content) => {
            try {
                if (err) reject('Error loading client secret file:', err)

                let auth = await authorize(JSON.parse(content))
                resolve(auth)
            } catch (error) {
                reject(error)
            }
        })
    })
}

function authorize(credentials) {
    return new Promise((resolve, reject) => {
        const { client_secret, client_id, redirect_uris } = credentials.installed;
        const oAuth2Client = new google.auth.OAuth2(
            client_id, client_secret, redirect_uris[0]);

        // Check if we have previously stored a token.
        fs.readFile(TOKEN_PATH, async (err, token) => {
            try {
                if (err) {
                    let auth = await getAccessToken(oAuth2Client);
                    resolve(auth)
                }

                await oAuth2Client.setCredentials(JSON.parse(token));
                resolve(oAuth2Client)
            } catch (error) {
                reject(error)
            }
        });
    })
}

function getAccessToken(oAuth2Client) {
    return new Promise((resolve, reject) => {
        const authUrl = oAuth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES,
        });
        // console.log('Authorize this app by visiting this url:', authUrl);
        functions.logger.info('Authorize this app by visiting this url:', authUrl);
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });
        rl.question('Enter the code from that page here: ', (code) => {
            rl.close();
            oAuth2Client.getToken(code, (err, token) => {
                if (err) reject('Error retrieving access token', err)
                oAuth2Client.setCredentials(token);
                // Store the token to disk for later program executions
                fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
                    if (err) reject(err)
                    // console.log('Token stored to', TOKEN_PATH);
                    functions.logger.info('Token stored to', TOKEN_PATH);
                });

                resolve(oAuth2Client)
            });
        });
    })
}

const findFolderV2 = (auth, folderName) => {
    return new Promise((resolve, reject) => {
        const drive = google.drive({ version: 'v3', auth });
        var pageToken = null;
        async.doWhilst(function () {
            drive.files.list({
                q: "mimeType = 'application/vnd.google-apps.folder' and 'root' in parents and trashed = false",
                fields: 'nextPageToken, files(id, name, parents, mimeType, modifiedTime)',
                spaces: 'drive',
                pageToken: pageToken
            }, function (err, res) {
                if (err) {
                    // Handle error
                    // console.error('Find Folder Error\n', err);
                    reject('Find Folder Error\n', err)
                } else {
                    // console.log(res)
                    res.data.files.forEach(function (file) {
                        // console.log(`${file.id}     :       ${file.name}`)
                        if (file.name === folderName) resolve(file)
                    });
                    pageToken = res.data.nextPageToken;
                    if (pageToken == null) resolve(null)
                }
            });
        }, function () {
            return !!pageToken;
        })
    })
}

const findFileWithParent = (auth, parentId, fileName) => {
    return new Promise((resolve, reject) => {
        const drive = google.drive({ version: 'v3', auth });
        var pageToken = null;
        async.doWhilst(function () {
            drive.files.list({
                q: `'${parentId}' in parents and trashed = false`,
                fields: 'nextPageToken, files(id, name, parents, mimeType, modifiedTime)',
                spaces: 'drive',
                pageToken: pageToken
            }, function (err, res) {
                if (err) {
                    // Handle error
                    // console.error('Find File Error\n', err);
                    reject('Find File Error\n', err, parentId, fileName)
                } else {
                    // console.log(res)
                    res.data.files.forEach(function (file) {
                        // console.log(file)
                        // console.log(`${file.id}     :       ${file.name}`)
                        if (file.name === fileName) resolve(file)
                    });
                    pageToken = res.data.nextPageToken;
                    if (pageToken == null) resolve(null)
                }
            });
        }, function () {
            return !!pageToken;
        })
    })
}

const createFolder = (auth, foldername) => {
    return new Promise(async (resolve) => {
        const drive = google.drive({ version: 'v3', auth });
        var fileMetadata = {
            'name': foldername,
            'mimeType': 'application/vnd.google-apps.folder'
        };
        await drive.files.create({
            resource: fileMetadata,
            fields: 'id, name'
        }, function (err, res) {
            if (err) {
                // Handle error
                console.error(err);
                resolve('')
            } else {
                // console.log('create folder success')
                resolve(res.data.id)
            }
        });
    })
}

const moveFile = (auth, parentId, fileId) => {
    return new Promise((resolve) => {
        const drive = google.drive({ version: 'v3', auth });
        let moveObject = {
            addParents: parentId,
            removeParents: 'root',
            fileId: fileId
        }
        drive.files.update(moveObject, (err, file) => {
            if (err) {
                // console.log('file mvoe error', err)
                resolve(false)
            } else {
                // console.log('move file  :', file)
                resolve(true)
            }
        })
    })
}

const createSheet = (auth, sheetTitle) => {
    return new Promise(async (resolve, reject) => {
        const sheets = google.sheets({ version: 'v4', auth });
        const resource = {
            properties: {
                title: sheetTitle,
                locale: 'zh_HK',
                timeZone: 'Asia/Hong_Kong'
            },
            sheets: {
                properties: {
                    title: "sheet1"
                }
            }
        }
        await sheets.spreadsheets.create({
            resource,
            // fields: 'spreadsheetId',
        }, (err, spreadsheet) => {
            if (err) {
                // Handle error.
                // console.log('error', err);
                reject('craete sheet Error  ', err)
            } else {
                // console.log('create sheet   :', spreadsheet)
                // console.log(`---------Spreadsheet ID-----------: ${spreadsheet.data.spreadsheetId}`); 
                // console.log(spreadsheet.data.sheets)
                resolve(spreadsheet)
            }
        });
    })
}

const listSheetValues = (auth, sheetId) => {
    return new Promise((resolve, reject) => {
        const sheets = google.sheets({ version: 'v4', auth })
        sheets.spreadsheets.values.get({
            spreadsheetId: sheetId,
            range: "sheet1!A2:L",
        }, (err, result) => {
            if (err) {
                // Handle error
                // console.log(err);
                reject('listing sheet Error,', err)
            } else {
                // console.log(result)
                // console.log(`range: ${result.data.range}`)
                // console.log(`majorDimension ${result.data.majorDimension}`)
                // console.log(`values.length  :   ${result.data.values.length}`)
                // result.data.values.forEach((value, index) => {
                //     console.log(`row${index + 1}    ${value}`)
                // })
                if (result.data.values == null || result.data.values == 'undefined') {
                    resolve(null)
                } else {
                    resolve(result.data.values)
                }
            }
        });
    })
}

const listSheetValuesV2 = (auth, sheetId) => {
    return new Promise((resolve, reject) => {
        const sheets = google.sheets({ version: 'v4', auth })
        sheets.spreadsheets.values.get({
            spreadsheetId: sheetId,
            range: "sheet1!A3:L",
        }, (err, result) => {
            if (err) {
                reject('listing sheet Error,', err)
            } else {
                if (result.data.values == null || result.data.values == 'undefined') {
                    resolve(null)
                } else {
                    resolve(result.data.values)
                }
            }
        });
    })
}

const initMappingTable = (auth, mappingSheetId) => {
    return new Promise((resolve, reject) => {
        const sheets = google.sheets({ version: 'v4', auth })
        let values = [
            ['id', 'post created time', 'post url', 'post message', 'spreadSheet name']
        ]
        const resource = { values }

        sheets.spreadsheets.values.update({
            spreadsheetId: mappingSheetId,
            range: 'A1',
            valueInputOption: 'RAW',
            resource,
        }, (err, result) => {
            if (err) {
                // Handle error
                // console.log(err);
                reject('init mapping table Error', err)
            } else {
                // console.log(result)
                // console.log('%d cells updated.', result.updatedCells);
                resolve(result)
            }
        })

    })
}

const updateMappingTableValue = (auth, mappingSheetId, postArray, mappingSheetValueArray) => {
    return new Promise((resolve, reject) => {
        const sheets = google.sheets({ version: 'v4', auth })
        let values = []
        let range
        // console.log('parse in :', mappingSheetValueArray)
        // console.log('parse in :', postArray)

        if (mappingSheetValueArray == null || mappingSheetValueArray == 'undefined') {
            range = 'A2'
            postArray.forEach((value) => {
                values.push(
                    [
                        value.id,
                        value.created_time,
                        `\=HYPERLINK\(\"${value.permalink_url}\", \"(View Post)\"\)`,
                        value.message,
                        `${value.created_time}_${value.id}`
                    ]
                )
            })
        } else {
            range = `A${mappingSheetValueArray.length + 2}`
            let differences = postArray.filter(compareFBValuesWithGoogleSheet(mappingSheetValueArray))
            differences.forEach((value) => {
                values.push(
                    [
                        value.id, 
                        value.created_time,
                        `\=HYPERLINK\(\"${value.permalink_url}\", \"(View Post)\"\)`,
                        value.message, 
                        `${value.created_time}_${value.id}`
                    ]
                )
            })
        }

        const resource = { values }
        sheets.spreadsheets.values.update({
            spreadsheetId: mappingSheetId,
            range,
            valueInputOption: 'USER_ENTERED',
            resource,
        }, (err, result) => {
            if (err) {
                // Handle error
                // console.log(err);
                reject('udpate mapping table Error', err)
            } else {
                // console.log(result)
                // console.log('%d cells updated.', result.updatedCells);
                resolve(result)
            }
        })
    })
}

function compareFBValuesWithGoogleSheet(otherArray) {
    return function (current) {
        return otherArray.filter((other) => {
            // console.log('other:', other)
            // console.log('current:', current)

            // console.log('current.id:', current.id)
            // console.log('other[0]:', other[0])
            return current.id == other[0]
        }).length == 0
    }
}

const initPostSheetValue = (auth, postSheetId, postNCommentsData) => {
    return new Promise((resolve, reject) => {
        const sheets = google.sheets({ version: 'v4', auth })
        let values = []
        if (postNCommentsData != null && postNCommentsData != 'undefined') {
            values.push([postNCommentsData.permalink_url, '', '', postNCommentsData.message])
        } else {
            values.push([])
        }

        values.push(['commnet_id', 'comment created time', 'comment url', 'profile name', 'comment'])
        const resource = { values }

        sheets.spreadsheets.values.update({
            spreadsheetId: postSheetId,
            range: 'A1',
            valueInputOption: 'RAW',
            resource,
        }, (err, result) => {
            if (err) {
                // Handle error
                // console.log(err);
                reject('init mapping table Error', err)
            } else {
                // console.log(result)
                // console.log('%d cells updated.', result.updatedCells);
                resolve(result)
            }
        })

    })
}

const updatePostCommentsValue = (auth, postSheetId, commentArray, postSheetValueArray) => {
    return new Promise((resolve, reject) => {
        const sheets = google.sheets({ version: 'v4', auth })
        let values = []
        let range
        if (postSheetValueArray == null || postSheetValueArray == 'undefined') {
            range = 'A3'
            commentArray.forEach(value => {
                values.push(
                    [
                        value.id, 
                        value.created_time, 
                        `\=HYPERLINK\(\"${value.permalink_url}\", \"(View Comment)\"\)`,
                        value.from ? value.from.name : '', 
                        value.message
                    ]
                )
            })
        } else {
            range = `A${postSheetValueArray.length + 3}`
            let differences = commentArray.filter(compareFBValuesWithGoogleSheet(postSheetValueArray))
            differences.forEach(value => {
                values.push(
                    [
                        value.id, 
                        value.created_time, 
                        `\=HYPERLINK\(\"${value.permalink_url}\", \"(View Comment)\"\)`, 
                        value.from ? value.from.name : '', 
                        value.message
                    ]
                )
            })
        }

        const resource = { values }
        sheets.spreadsheets.values.update({
            spreadsheetId: postSheetId,
            range,
            valueInputOption: 'USER_ENTERED',
            resource,
        }, (err, result) => {
            if (err) {
                reject('udpate post comments', err)
            } else {
                resolve(result)
            }
        })
    })
}
/** End of Google Part */

exports.main = async () => {
    try {
        let auth = await getGoogleAuth();
        if (auth != null && auth != 'undefined') {
            // console.log('Google oAuth2:\n', auth)

            let baseFolderId
            let findReuslt = await findFolderV2(auth, 'ShoppingDaddy')
            if (findReuslt == null) {
                // no folder need to create
                baseFolderId = await createFolder(auth, 'ShoppingDaddy')
            } else {
                baseFolderId = findReuslt.id
            }

            if (baseFolderId != '') {
                let mappingSheetId
                let hasMappingSheets = await findFileWithParent(auth, baseFolderId, 'MappingTable')
                if (hasMappingSheets == null) {

                    let createdSheetResult = await createSheet(auth, 'MappingTable')
                    if (createdSheetResult != null) {
                        mappingSheetId = createdSheetResult.data.spreadsheetId
                        let initMappingTableResult = await initMappingTable(auth, mappingSheetId)
                        // console.log('init mappingTable result   ', initMappingTableResult)

                        let moveReuslt = await moveFile(auth, baseFolderId, createdSheetResult.data.spreadsheetId)
                        if (moveReuslt) {
                            // console.log('move file success')
                            functions.logger.log('move file success')                            
                        } else {
                            // console.log('move file failed')
                            functions.logger.log('move file failed')                            
                        }
                    }

                } else {
                    mappingSheetId = hasMappingSheets.id
                }

                // console.log('mapping sheet Id   :   ', mappingSheetId)
                functions.logger.log('mapping sheet Id   :   ', mappingSheetId)
                let mappingSheetValueArray = await listSheetValues(auth, mappingSheetId)
                let listAllFBPostsResponse = await listAllFBPosts()
                if (listAllFBPostsResponse !== null || listAllFBPostsResponse != 'undefined') {
                    let postArray = listAllFBPostsResponse.data
                    if (postArray != null && postArray != 'undefined') {
                        // convert dattime to Hong Kong's timezone
                        postArray.forEach((post, index) => {
                            postArray[index].created_time = Utils.convertTimeZone(post.created_time)
                        })
                        // change the order of Facebook posts
                        postArray.reverse()

                        updateMappingTableValue(auth, mappingSheetId, postArray, mappingSheetValueArray)

                        // postArray.forEach(post => {
                        //     // main2(post.id)
                        //     let response = axios.get(`https://asia-east2-shopping-daddy.cloudfunctions.net/loopPosts/${post.id}`)
                        // })
                    }
                }


            }
        } else {
            cfunctions.logger.log('auth failed')
        }
    } catch (error) {
        functions.logger.error(error)
    }
}

exports.main2 = async (postId) => {
    try {
        let auth = await getGoogleAuth();
        if (auth != null && auth != 'undefined') {
            let postNCommentsData = await getPostData(postId)
            let comments = await listComments(postId)

            if (postNCommentsData != null && postNCommentsData != 'undefined') {
                // update dateTime of post object
                postNCommentsData['created_time'] = Utils.convertTimeZone(postNCommentsData.created_time)
                postNCommentsData.comments = comments

                let baseFolderId
                let findReuslt = await findFolderV2(auth, 'ShoppingDaddy')
                if (findReuslt == null) {
                    // no folder need to create
                    baseFolderId = await createFolder(auth, 'ShoppingDaddy')
                } else {
                    baseFolderId = findReuslt.id
                }

                if (baseFolderId != '') {
                    let postSheetId
                    let hasPostSheet = await findFileWithParent(auth, baseFolderId, `${postNCommentsData.created_time}_${postNCommentsData.id}`)
                    if (hasPostSheet == null) {

                        let createdSheetResult = await createSheet(auth, `${postNCommentsData.created_time}_${postNCommentsData.id}`)
                        if (createdSheetResult != null) {
                            postSheetId = createdSheetResult.data.spreadsheetId
                            let initPostSheetValueResult = await initPostSheetValue(auth, postSheetId, postNCommentsData)

                            let moveReuslt = await moveFile(auth, baseFolderId, createdSheetResult.data.spreadsheetId)
                            if (moveReuslt) {
                                // console.log('move file success')
                                functions.logger.log('move file success')                            
                            } else {
                                // console.log('move file failed')
                                functions.logger.log('move file failed')                            
                            }
                        }

                    } else {
                        postSheetId = hasPostSheet.id
                    }

                    // console.log('post\'s sheet id   :   ', postSheetId)
                    functions.logger.log('post\'s sheet id   :   ', postSheetId)
                    let postSheetValueArray = await listSheetValuesV2(auth, postSheetId)
                    let commentArray = []
                    if (postNCommentsData.comments) {
                        commentArray = postNCommentsData.comments
                    }
                    // console.log(postSheetValueArray)
                    // console.log(commentArray)
                    if (commentArray.length > 0) {
                        // convert dattime to Hong Kong's timezone
                        commentArray.forEach((comment, index) => {
                            commentArray[index].created_time = Utils.convertTimeZone(comment.created_time)
                        })
                        // change the order of Facebook posts
                        commentArray.reverse()

                        let updateCommentsResult = updatePostCommentsValue(auth, postSheetId, commentArray, postSheetValueArray)
                    }

                }
            }

        }
    } catch (error) {
        // console.log(error)
        functions.logger.error('main 2 :   ', error)
    }
}
