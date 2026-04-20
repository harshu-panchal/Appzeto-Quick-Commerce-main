import dotenv from 'dotenv'
import connectDB from '../app/dbConfig/dbConfig.js'
import Seller from '../app/models/seller.js'
import Product from '../app/models/product.js'
import Category from '../app/models/category.js'

dotenv.config()

const run = async () => {
  await connectDB()
  const seller = await Seller.findOne({ email: 'harsh@appzeto.com' })
  if (seller) {
    await Product.deleteMany({ sellerId: seller._id })
  }
  const threshold = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const candidates = await Category.find({ createdAt: { $gte: threshold } })
  for (const c of candidates) {
    const children = await Category.countDocuments({ parentId: c._id })
    const prodRefs = await Product.countDocuments({
      $or: [{ headerId: c._id }, { categoryId: c._id }, { subcategoryId: c._id }]
    })
    if (children === 0 && prodRefs === 0) {
      await Category.deleteOne({ _id: c._id })
    }
  }
  process.exit(0)
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
