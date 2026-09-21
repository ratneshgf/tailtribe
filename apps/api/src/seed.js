import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User, Pet, Kyc } from './models/index.js';

const PETS = [
  ['Mocha','Dog','Indie / Mixed',2,'Female','Gwalior','474002',0,'Full','Published'],
  ['Pepper','Cat','Domestic Shorthair',1,'Male','Bhopal','462003',6500,'Full','Published'],
  ['Snow','Rabbit','Mini Lop',1,'Female','Indore','452001',2200,'Partial','Published'],
  ['Rio','Bird','Budgerigar',1,'Male','Gwalior','474011',1500,'Full','Published'],
  ['Bruno','Dog','Labrador Retriever',3,'Male','Jhansi','284001',0,'Full','Published'],
  ['Misty','Cat','Persian',2,'Female','Bhopal','462016',9000,'Partial','Pending Review'],
];

await mongoose.connect(process.env.MONGODB_URI);
await Promise.all([User.deleteMany({}), Pet.deleteMany({}), Kyc.deleteMany({})]);
const hash = await bcrypt.hash('Password123', 12);
const mk = (name, email, role, kycStatus, status) => ({ name, email, passwordHash: hash, role, kycStatus, status });
const [seller, buyer, admin, newSeller] = await User.create([
  mk('Aarav Mehta','seller@tailtribe.test','seller','Approved','Active'),
  mk('Ishita Rao','buyer@tailtribe.test','buyer','Approved','Active'),
  mk('Platform Admin','admin@tailtribe.test','admin','Approved','Active'),
  mk('Karan Shah','karan@tailtribe.test','seller','Submitted','Pending Verification'),
]);
await Kyc.create({ userId: newSeller.id, documentType: 'Government ID', documentRef: 'private/kyc/karan.enc' });
await Pet.create(PETS.map(([name,species,breed,ageYears,gender,city,pincode,price,vaccination,status], i) => ({
  ownerId: (i === 5 ? newSeller : seller).id, name, species, breed, ageYears, gender, city, pincode, price,
  vaccination, status, adoptionType: price > 0 ? 'sale' : 'free',
  health: vaccination === 'Full' ? 'Dewormed, sterilised, no known conditions.' : 'Dewormed. Owner-reported; not independently verified.',
  about: `${name} is a ${ageYears}-year-old ${breed.toLowerCase()} looking for a responsible home.`,
})));
console.log('Seeded. Logins: seller@ / buyer@ / admin@tailtribe.test — password: Password123');
await mongoose.disconnect();
