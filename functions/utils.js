const moment = require('moment-timezone');

exports.convertTimeZone = (dateTime) => {
    return moment(dateTime).tz('Asia/Hong_Kong').format()
}

