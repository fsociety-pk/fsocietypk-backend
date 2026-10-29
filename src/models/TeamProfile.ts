import { Schema, model } from 'mongoose';

const link = new Schema({ label: { type: String, required: true }, url: { type: String, required: true } }, { _id: false });
const member = new Schema({
  id: { type: String, required: true }, handle: { type: String, required: true },
  name: { type: String, default: '' }, role: { type: String, default: '' }, bio: { type: String, default: '' },
  image: { type: String, default: '' }, specialties: [String], links: [link],
}, { _id: false });
const social = new Schema({ label: String, detail: String, url: String, kind: String }, { _id: false });
const schema = new Schema({
  slug: { type: String, default: 'main', unique: true, required: true },
  introduction: { type: String, required: true }, story: [String], disciplines: [String],
  members: [member], socials: [social],
}, { timestamps: true });
export const TeamProfile = model('TeamProfile', schema);

export const defaultTeamProfile = {
  introduction: 'A cybersecurity community from Pakistan. We learn through CTFs, share what we discover, and build practical security skills together.',
  story: ['Fsociety PK brings together people who want to understand how systems work, where they break, and how to make them stronger.', 'Our platform is a place to practice challenges, read community writeups, and contribute your own work. This is the home of the team behind it.'],
  disciplines: ['Web security', 'Cryptography', 'Digital forensics', 'Binary exploitation', 'Reverse engineering', 'OSINT'],
  members: [],
  socials: [
    { label: 'Discord', detail: 'Join the conversation', url: 'https://discord.gg/T92aGQn5f', kind: 'discord' },
    { label: 'GitHub', detail: 'Explore our projects', url: 'https://github.com/fsociety-pk', kind: 'github' },
    { label: 'LinkedIn', detail: 'Follow team updates', url: 'https://www.linkedin.com/company/fsociety-pk/', kind: 'linkedin' },
    { label: 'CTFtime', detail: 'Our competition profile', url: 'https://ctftime.org/team/432687', kind: 'ctftime' },
    { label: 'Email', detail: 'contact@fsocietypk.tech', url: 'mailto:contact@fsocietypk.tech', kind: 'email' },
  ],
};
