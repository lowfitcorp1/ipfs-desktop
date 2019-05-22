/* eslint-env mocha */

const Application = require('spectron').Application
const electronPath = require('electron') // Require Electron from the binaries included in node_modules.
const path = require('path')
const fs = require('fs-extra')
const tmp = require('tmp')
const delay = require('delay')
const chai = require('chai')
const dirtyChai = require('dirty-chai')
const expect = chai.expect
chai.use(dirtyChai)

const { makeRepository } = require('./utils/ipfsd')

// To print the app logs, add the following to your test:
//
// const logs = await app.client.getMainProcessLogs()
// logs.forEach(line => console.log(line))
//

async function startApp ({
  home = createTmpDir(),
  ipfsPath = path.join(home, '.ipfs')
}) {
  const app = new Application({
    path: electronPath,
    args: ['-r', path.join(__dirname, 'utils/include.js'), path.join(__dirname, '../src/index.js')],
    env: {
      NODE_ENV: 'test',
      HOME: home,
      IPFS_PATH: ipfsPath
    }
  })
  await app.start()
  return { app, ipfsPath, home }
}

function createTmpDir () {
  return tmp.dirSync({ unsafeCleanup: true }).name
}

describe('Application launch', function () {
  this.timeout(60000)
  afterEach(async function () {
    if (this.app && this.app.isRunning()) {
      try {
        await this.app.stop()
      } catch (err) {
        console.log(err)
      }
      this.app = null
    }
    if (this.ipfsd && this.ipfsd) {
      try {
        await this.ipfsd.stop()
      } catch (err) {
        console.log(err)
      }
      this.ipfsd = null
    }
  })

  it('creates a repository on startup', async function () {
    const { app, home } = await startApp({})
    this.app = app

    const configPath = path.join(home, '.ipfs', 'config')
    expect(app.isRunning()).to.be.true()

    // TODO: need a signal from the app to know when ipfs is ready.
    // SEE: can't listent for IPC events in spectron https://github.com/electron/spectron/issues/91
    await delay(10000)
    console.log(`checking ipfs config ${configPath}`)
    const config = fs.readJsonSync(configPath)
    expect(config).to.exist()
    // ensure strict CORS checking is enabled
    expect(config.API.HTTPHeaders).to.deep.equal({})
    expect(config.Discovery.MDNS.Enabled).to.be.true()
  })

  it('starts with initial repository', async function () {
    const { ipfsd } = await makeRepository()
    const { app } = await startApp({ ipfsPath: ipfsd.repoPath })
    this.app = app
    this.ipfsd = ipfsd
  })

  it('fixes config for cors checking', async function () {
    const { ipfsd } = await makeRepository()
    const { repoPath } = ipfsd
    await ipfsd.stop()
    const configPath = path.join(repoPath, 'config')
    const initConfig = fs.readJsonSync(configPath)
    expect(initConfig.API.HTTPHeaders['Access-Control-Allow-Origin']).to.include('*')

    const { app } = await startApp({ ipfsPath: repoPath })
    this.app = app
    delay(5000)
    const config = fs.readJsonSync(configPath)
    expect(config.API.HTTPHeaders).to.deep.equal({})
  })

  it(`starts with repository with 'api' file`, async function () {
    const { ipfsd } = await makeRepository()
    const { repoPath } = ipfsd
    await ipfsd.stop()
    const configPath = path.join(repoPath, 'config')
    const apiPath = path.join(repoPath, 'api')
    const config = fs.readJsonSync(configPath)
    fs.writeFile(apiPath, config.Addresses.API)
    const { app } = await startApp({ ipfsPath: ipfsd.repoPath })
    this.app = app
  })
})
