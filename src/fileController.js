const fs = require('fs')
const path = require('path')

const fileStore = path.join(__dirname, 'store')

const makeCache = () => {
  const cachePath = path.join(fileStore, 'imageCache.json')
  return new Promise((resolve, reject) => {
    fs.stat(cachePath, err => {
      if (err && err.code === 'ENOENT') {
        fs.writeFileSync(cachePath, JSON.stringify({ data: [] }))
        resolve(cachePath)
      }
      if (err) reject(err)
      resolve(cachePath)
    })
  })
}

const getCached = (pth) => {
  return JSON.parse(fs.readFileSync(pth))
}

const putCached = (pth, data) => {
  const sortData = data.sort((a, b) => b.r - a.r)
  fs.writeFileSync(pth, JSON.stringify({ data: sortData }))
}

const addImageAttempt = async (path) => {
  const cachePath = await makeCache()
  const cachedData = getCached(cachePath).data
  const matchingData = cachedData.filter(d => d.p === path)
  if (matchingData.length) {
    const tmpCache = cachedData.filter(d => d.p !== path)
    tmpCache.push({
      p: path,
      r: matchingData[0].r + 1,
      rr: matchingData[0].rr + 1,
      lr: new Date().getTime(),
      lt: matchingData[0].lt
    })
    putCached(cachePath, tmpCache)
  } else {
    cachedData.push({
      p: path,
      r: 0,
      rr: 0,
      lr: new Date().getTime(),
      lt: null
    })
    putCached(cachePath, cachedData)
  }
}

module.exports = {
  addImageAttempt
}
