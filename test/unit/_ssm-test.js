let test = require('tape')
let aws = require('aws-sdk-mock')
let ssm = require('../../src/_ssm')

test('getDeployBucket should error if SSM.getParameter errors', t => {
  t.plan(1)
  aws.mock('SSM', 'getParameter', (params, cb) => {
    cb(true)
  })
  ssm.getDeployBucket('appname', (err) => {
    t.ok(err, 'error surfaced')
    aws.restore()
  })
})

test('getDeployBucket should return null if SSM.getParameter cannot be found', t => {
  t.plan(1)
  aws.mock('SSM', 'getParameter', (params, cb) => {
    cb({ code: 'ParameterNotFound' })
  })
  ssm.getDeployBucket('appname', (err) => {
    t.notOk(err, 'error not surfaced')
    aws.restore()
  })
})

test('getDeployBucket should return the deploy bucket parameter value if it exists', t => {
  t.plan(2)
  aws.mock('SSM', 'getParameter', (params, cb) => {
    cb(null, { Parameter: { Value: 'dfv' } })
  })
  ssm.getDeployBucket('appname', (err, val) => {
    t.notOk(err, 'no error surfaced')
    t.equals(val, 'dfv', 'parameter value returned')
    aws.restore()
  })
})

test('deleteAll should gracefully handle no parameters being found', t => {
  t.plan(1)
  aws.mock('SSM', 'getParametersByPath', (params, cb) => {
    cb({ code: 'ParameterNotFound' })
  })
  aws.mock('SSM', 'deleteParameters', (params, cb) => {
    cb(null, {})
  })
  ssm.deleteAll('appname', 'staging', (err) => {
    t.notOk(err, 'no error surfaced')
    aws.restore()
  })
})
test('deleteAll should delete all collected params', t => {
  t.plan(2)
  let paramsDeleted = []
  aws.mock('SSM', 'deleteParameters', (params, cb) => {
    paramsDeleted = params.Names
    cb(null, {})
  })
  aws.mock('SSM', 'getParametersByPath', (params, cb) => {
    cb(null, { Parameters: [ { Name: 'bond' } ] })
  })
  ssm.deleteAll('appname', 'staging', (err) => {
    t.notOk(err, 'no error surfaced')
    t.ok(paramsDeleted.includes('bond'), 'parameter returned by getParametersByPath passed into deleteParameters')
    aws.restore()
  })
})

test('deleteAll should handle SSM parameter paths that contain more than 10 parameters (recursive collect)', t => {
  t.plan(2)
  let paramsDeleted = []
  aws.mock('SSM', 'deleteParameters', (params, cb) => {
    paramsDeleted = paramsDeleted.concat(params.Names)
    cb(null, {})
  })
  let appParams = []
  for (let i = 0; i < 13; i++) {
    appParams.push(`param${i}`)
  }
  aws.mock('SSM', 'getParametersByPath', (params, cb) => {
    let batch = appParams.splice(0, 10)
    cb(null, {
      Parameters: batch.map(p => ({ Name: p })),
      NextToken: appParams.length > 0 ? 'moarplz' : null
    })
  })
  ssm.deleteAll('appname', 'staging', (err) => {
    t.notOk(err, 'no error surfaced')
    t.equals(paramsDeleted.length, 13, '<number of app params> deleted')
    aws.restore()
  })
})
