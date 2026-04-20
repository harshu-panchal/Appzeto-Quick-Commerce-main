import dotenv from 'dotenv'
import connectDB from '../app/dbConfig/dbConfig.js'
import Category from '../app/models/category.js'
import { slugify } from '../app/utils/slugify.js'

dotenv.config()

const run = async () => {
  const headerName = process.argv[2] || ''
  const categoryName = process.argv[3] || ''
  if (!headerName || !categoryName) {
    console.log('usage: node scripts/getSubcategories.js <header> <category>')
    process.exit(0)
  }
  await connectDB()
  const header = await Category.findOne({ type: 'header', slug: slugify(headerName) })
  if (!header) {
    console.log('header not found')
    process.exit(0)
  }
  const category = await Category.findOne({ type: 'category', parentId: header._id, slug: slugify(categoryName) })
  if (!category) {
    console.log('category not found')
    process.exit(0)
  }
  const subs = await Category.find({ type: 'subcategory', parentId: category._id }).sort({ name: 1 })
  console.log(`Subcategories under ${headerName} > ${categoryName}: ${subs.length}`)
  for (const s of subs) {
    console.log(`- ${s.name} (${s.slug})`)
  }
  process.exit(0)
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
