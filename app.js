const express = require('express')
const path = require('path')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const app = express()
app.use(express.json())

let database = null

const initializeDBandServer = async () => {
  try {
    database = await open({
      filename: path.join(__dirname, 'twitterClone.db'),
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server is running on http://localhost:3000/')
    })
  } catch (error) {
    console.log(`DataBase error is ${error.message}`)
    process.exit(1)
  }
}

initializeDBandServer()

// -------------  Authentication with JWT Token  ----------------

function authenticationJwt(request, response, next) {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'some_key', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username
        next()
      }
    })
  }
}

//  -------------------  API 1  --------------------

app.post('/register/', async (request, response) => {
  const {username, password, name, gender} = request.body
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`
  const databaseUser = await database.get(selectUserQuery)
  const hashedPassword = await bcrypt.hash(password, 10)
  if (databaseUser === undefined) {
    const createUserQuery = `INSERT INTO user (username, name, password, gender)
    VALUES ('${username}', '${name}', '${hashedPassword}', '${gender}');`
    if (password.length >= 6) {
      await database.run(createUserQuery)
      response.status(200)
      response.send('User created successfully')
    } else {
      response.status(400)
      response.send('Password is too short')
    }
  } else {
    response.status(400)
    response.send('User already exists')
  }
})

//  -------------------  API 2  --------------------

app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`
  const databaseUser = await database.get(selectUserQuery)
  if (databaseUser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const validatepass = await bcrypt.compare(password, databaseUser.password)
    if (validatepass) {
      const payLoad = {username: username}
      const jwtToken = jwt.sign(payLoad, 'some_key')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

//  -------------------  API 3  --------------------

app.get('/user/tweets/feed/', authenticationJwt, async (request, response) => {
  let {username} = request
  const getUserIdQ = `SELECT * FROM user WHERE username = '${username}';`
  const userId = await database.get(getUserIdQ)

  const getFollowingIdQ = `SELECT following_user_id FROM follower WHERE follower_user_id = ${userId.user_id};`
  const getFollowingId = await database.all(getFollowingIdQ)
  const listOfId = getFollowingId.map(each => each.following_user_id)
  const getTweetsQuery = `SELECT user.username, tweet.tweet, tweet.date_time as dateTime FROM
  user INNER JOIN tweet ON user.user_id = tweet.user_id 
  WHERE user.user_id in (${listOfId}) 
  ORDER BY tweet.date_time DESC 
  LIMIT 4;`
  const recentTweets = await database.all(getTweetsQuery)
  response.send(recentTweets)
})

//  ---------------------  API 4  ------------------------

app.get('/user/following/', authenticationJwt, async (request, response) => {
  let {username} = request
  const getUserIdQ = `SELECT * FROM user WHERE username = '${username}';`
  const userId = await database.get(getUserIdQ)
  const getFollowingIdQ = `SELECT following_user_id FROM follower WHERE follower_user_id = ${userId.user_id};`
  const getFollowingId = await database.all(getFollowingIdQ)
  const listOfId = getFollowingId.map(each => each.following_user_id)
  const getFollowersResultQuery = `select name from user where user_id in (${listOfId});`
  const responseResult = await database.all(getFollowersResultQuery)
  response.send(responseResult)
})

//   ------------------ API 5 -------------------

app.get('/user/followers/', authenticationJwt, async (request, response) => {
  let {username} = request
  const getUserIdQuery = `select user_id from user where username='${username}';`
  const getUserId = await database.get(getUserIdQuery)
  const getFollowerIdsQuery = `select follower_user_id from follower where following_user_id=${getUserId.user_id};`
  const getFollowerIdsArray = await database.all(getFollowerIdsQuery)
  const getFollowerIds = getFollowerIdsArray.map(
    eachUser => eachUser.follower_user_id,
  )
  const getFollowersNameQuery = `SELECT name FROM user WHERE user_id in (${getFollowerIds});`
  const getFollowersName = await database.all(getFollowersNameQuery)
  response.send(getFollowersName)
})

//   ------------------ API 6 -------------------

const api6Output = (tweetData, likesCount, replyCount) => {
  return {
    tweet: tweetData.tweet,
    likes: likesCount.likes,
    replies: replyCount.replies,
    dateTime: tweetData.date_time,
  }
}

app.get('/tweets/:tweetId/', authenticationJwt, async (request, response) => {
  const {tweetId} = request.params
  let {username} = request
  const getUserIdQuery = `select user_id from user where username='${username}';`
  const getUserId = await database.get(getUserIdQuery)
  const getFollowingIdsQuery = `select following_user_id from follower where follower_user_id=${getUserId.user_id};`
  const getFollowingIdsArray = await database.all(getFollowingIdsQuery)
  const getFollowingIds = getFollowingIdsArray.map(eachFollower => {
    return eachFollower.following_user_id
  })
  const getTweetIdsQuery = `select tweet_id from tweet where user_id in (${getFollowingIds});`
  const getTweetIdsArray = await database.all(getTweetIdsQuery)
  const followingTweetIds = getTweetIdsArray.map(eachId => {
    return eachId.tweet_id
  })
  if (followingTweetIds.includes(parseInt(tweetId))) {
    const likes_count_query = `select count(user_id) as likes from like where tweet_id=${tweetId};`
    const likes_count = await database.get(likes_count_query)
    const reply_count_query = `select count(user_id) as replies from reply where tweet_id=${tweetId};`
    const reply_count = await database.get(reply_count_query)
    const tweet_tweetDateQuery = `select tweet, date_time from tweet where tweet_id=${tweetId};`
    const tweet_tweetDate = await database.get(tweet_tweetDateQuery)
    response.send(api6Output(tweet_tweetDate, likes_count, reply_count))
  } else {
    response.status(401)
    response.send('Invalid Request')
  }
})

//  --------------------------  API 7 ------------------------

const convertLikedUserNameDBObjectToResponseObject = dbObject => {
  return {
    likes: dbObject,
  }
}
app.get(
  '/tweets/:tweetId/likes/',
  authenticationJwt,
  async (request, response) => {
    const {tweetId} = request.params
    let {username} = request
    const getUserIdQuery = `select user_id from user where username='${username}';`
    const getUserId = await database.get(getUserIdQuery)
    const getFollowingIdsQuery = `select following_user_id from follower where follower_user_id=${getUserId.user_id};`
    const getFollowingIdsArray = await database.all(getFollowingIdsQuery)
    const getFollowingIds = getFollowingIdsArray.map(eachFollower => {
      return eachFollower.following_user_id
    })
    if (getFollowingIds.includes(parseInt(tweetId))) {
      const getLikedUsersNameQuery = `select user.username as likes from user inner join like
       on user.user_id=like.user_id where like.tweet_id=${tweetId};`
      const getLikedUserNamesArray = await database.all(getLikedUsersNameQuery)
      const getLikedUserNames = getLikedUserNamesArray.map(eachUser => {
        return eachUser.likes
      })
      response.send(
        convertLikedUserNameDBObjectToResponseObject(getLikedUserNames),
      )
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

//  -------------------- API 8  ------------------------

const convertUserNameReplyedDBObjectToResponseObject = dbObject => {
  return {
    replies: dbObject,
  }
}
app.get(
  '/tweets/:tweetId/replies/',
  authenticationJwt,
  async (request, response) => {
    const {tweetId} = request.params
    let {username} = request
    const getUserIdQuery = `select user_id from user where username='${username}';`
    const getUserId = await database.get(getUserIdQuery)
    const getFollowingIdsQuery = `select following_user_id from follower where follower_user_id=${getUserId.user_id};`
    const getFollowingIdsArray = await database.all(getFollowingIdsQuery)
    const getFollowingIds = getFollowingIdsArray.map(eachFollower => {
      return eachFollower.following_user_id
    })
    const getTweetIdsQuery = `select tweet_id from tweet where user_id in (${getFollowingIds});`
    const getTweetIdsArray = await database.all(getTweetIdsQuery)
    const getTweetIds = getTweetIdsArray.map(eachTweet => {
      return eachTweet.tweet_id
    })
    if (getTweetIds.includes(parseInt(tweetId))) {
      const getUsernameReplyTweetsQuery = `select user.name, reply.reply from user inner join reply on user.user_id=reply.user_id
      where reply.tweet_id=${tweetId};`
      const getUsernameReplyTweets = await database.all(
        getUsernameReplyTweetsQuery,
      )
      response.send(
        convertUserNameReplyedDBObjectToResponseObject(getUsernameReplyTweets),
      )
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

//  -------------------- API 9  ------------------------

app.get('/user/tweets/', authenticationJwt, async (request, response) => {
  let {username} = request
  const getUserIdQuery = `select user_id from user where username='${username}';`
  const getUserId = await database.get(getUserIdQuery)
  const getTweetIdsQuery = `select tweet, likes, replies, date_time as dateTime from tweet where user_id=${getUserId.user_id};`
  const getTweetIdsArray = await database.all(getTweetIdsQuery)
  const getTweetIds = getTweetIdsArray.map(eachId => {
    return parseInt(eachId.tweet_id)
  })
  console.log(getTweetIds)
})

//  -------------------- API 10  ------------------------

app.post('/user/tweets/', authenticationJwt, async (request, response) => {
  let {username} = request
  const getUserIdQuery = `select user_id from user where username='${username}';`
  const getUserId = await database.get(getUserIdQuery)
  const {tweet} = request.body
  const currentDate = new Date()
  console.log(currentDate.toISOString().replace('T', ' '))

  const postRequestQuery = `insert into tweet(tweet, user_id, date_time) values ("${tweet}", ${getUserId.user_id}, '${currentDate}');`

  const responseResult = await database.run(postRequestQuery)
  const tweet_id = responseResult.lastID
  response.send('Created a Tweet')
})

//  ----------------------  api 11 --------------------------

app.delete(
  '/tweets/:tweetId/',
  authenticationJwt,
  async (request, response) => {
    const {tweetId} = request.params
    let {username} = request
    const getUserIdQuery = `select user_id from user where username='${username}';`
    const getUserId = await database.get(getUserIdQuery)
    const getUserTweetsListQuery = `select tweet_id from tweet where user_id=${getUserId.user_id};`
    const getUserTweetsListArray = await database.all(getUserTweetsListQuery)
    const getUserTweetsList = getUserTweetsListArray.map(eachTweetId => {
      return eachTweetId.tweet_id
    })
    if (getUserTweetsList.includes(parseInt(tweetId))) {
      const deleteTweetQuery = `delete from tweet where tweet_id=${tweetId};`
      await database.run(deleteTweetQuery)
      response.send('Tweet Removed')
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

module.exports = app
