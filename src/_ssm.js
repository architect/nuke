let aws = require('aws-sdk')
let parallel = require('run-parallel')
let chunk = require('lodash.chunk')

/**
 *
 */
module.exports = {
  getDeployBucket: function getDeployBucket (appname, callback) {
    let region = process.env.AWS_REGION
    let ssm = new aws.SSM({ region })
    ssm.getParameter({
      Name: `/${appname}/deploy/bucket`,
      WithDecryption: true
    }, function (err, data) {
      if (err && err.code !== 'ParameterNotFound') callback(err)
      else callback(null, (data && data.Parameter && data.Parameter.Value ? data.Parameter.Value : null))
    })
  },
  deleteAll: function deleteAll (appname, env, callback) {
    let region = process.env.AWS_REGION
    let ssm = new aws.SSM({ region })

    // set up for recursive retrieval of all parameters associated to the app
    // since SSM only support max 10 param retrieval at a time
    let results = {}
    function collectByPath (rootPath, NextToken, cb) {
      if (!results[rootPath]) results[rootPath] = []
      let query = {
        Path: rootPath,
        Recursive: true,
        MaxResults: 10
      }
      if (NextToken) query.NextToken = NextToken
      ssm.getParametersByPath(query, function (err, data) {
        // if the parameters are gone, that's fine too
        if (err && err.code !== 'ParameterNotFound') cb(err)
        else {
          if (data && data.Parameters && data.Parameters.length) {
            results[rootPath] = results[rootPath].concat(data.Parameters.map(param => param.Name))
            if (data.NextToken) collectByPath(rootPath, data.NextToken, cb)
            else cb(null, results[rootPath])
          }
          else cb(null, results[rootPath])
        }
      })
    }

    // destroy all SSM Parameters associated to app; a few formats:
    // /<app-name>/deploy/bucket - deployment bucket
    // /<app-name>/<env>/* - environment variables via `arc env`
    parallel([ `/${appname}/${env}`, `/${appname}/deploy` ].map(path => collectByPath.bind(null, path, null)), function paramsCollected (err, res) {
      if (err) callback(err)
      else {
        // While unlikely, it's possible for an app to have no SSM params
        // ... and when that happens, the following call will fail without things to delete
        if (res.length && res[0].length) {
          // byebye
          parallel(res.map((names) => function gotParams (callback) {
            const chunks = chunk(names, 10)
            parallel(chunks.map((Names) => function paramsChunked (callback) {
              ssm.deleteParameters({ Names }, callback)
            }), callback)
          }), function deleteParameters (err) {
            if (err) callback(err)
            else callback()
          })
        }
        else callback()
      }
    })
  }
}
