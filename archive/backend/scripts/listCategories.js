import dotenv from 'dotenv'
import connectDB from '../app/dbConfig/dbConfig.js'
import Category from '../app/models/category.js'

dotenv.config()

const run = async () => {
  await connectDB()
  const headers = await Category.find({ type: 'header' }).sort({ name: 1 })
  console.log(`Headers: ${headers.length}`)
  for (const h of headers) {
    const cats = await Category.find({ type: 'category', parentId: h._id }).sort({ name: 1 })
    console.log(`- ${h.name} (${h.slug}) cats:${cats.length}`)
    for (const c of cats.slice(0, 5)) {
      const subs = await Category.find({ type: 'subcategory', parentId: c._id }).sort({ name: 1 })
      console.log(`  * ${c.name} (${c.slug}) subs:${subs.length}`)
    }
  }
  process.exit(0)
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
