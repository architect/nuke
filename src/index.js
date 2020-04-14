let aws = require('aws-sdk')
let waterfall = require('run-waterfall')
let deleteBucketContents = require('./_delete-bucket-contents')

module.exports = function nuke(params, callback) {

  // always validate input
  if (!params.name)
    throw ReferenceError('missing params.name')

  // hack around no native promise in aws-sdk
  let promise
  if (!callback) {
    promise = new Promise(function ugh(res, rej) {
      callback = function errback(err, result) {
        if (err) rej(err)
        else res(result)
      }
    })
  }

  // actual code
  let region = process.env.AWS_REGION
  let cloudformation = new aws.CloudFormation({ region })

  waterfall([

    // check for the stack
    function(callback) {
      cloudformation.describeStacks({
        StackName: params.name 
      }, 
      function(err, data) {
        // console.log(data.Stacks[0].Outputs)
        if (err) callback(err) 
        else {
          let bucket = o=> o.OutputKey === 'BucketURL'
          let hasBucket = data.Stacks[0].Outputs.find(bucket)  
          callback(null, hasBucket)
        }
      })
    },

    // delete static assets
    function(bucketExists, callback) {
      if (bucketExists) {
        let bucket = bucketExists.OutputValue.replace('http://', '').split('.')[0]
        deleteBucketContents({ 
          bucket
        }, callback)
      }
      else {
        callback()
      }
    },

    // delete actual stack
    function(callback) {
      cloudformation.deleteStack({
        StackName: params.name, 
      }, 
      function(err) {
        if (err) callback(err)
        else callback()
      })
    },

    // poll for progress
    function(callback) {
      let tries = 1
      let max = 6
      function checkit() {
        cloudformation.describeStacks({
          StackName: params.name 
        }, 
        function done(err, data) {
          let msg = `Stack with id ${ params.name } does not exist`
          if (err && err.code == 'ValidationError' && err.message == msg) {
            callback() // this is good! its gone...
          }
          else {
            setTimeout(function delay() {
              if (tries === max) {
                callback(Error('nuke failed; hit max retries'))
              }
              else {
                tries += 1
                checkit()
              }
            }, 10000 * tries)
          }
        })
      }
      checkit()
    } 

  ], callback)

  // only happens if there is no callback
  return promise
}
