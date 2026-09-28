// Themed list icons: a curated set of Google's Noto emoji artwork, shipped with
// the app so they look the same on every phone (public/icons/set, Apache-2.0).
// A list's `emoji` field holds either an emoji character or an "icon:<id>" token.

export const ICONS = [
  { id: 'shopping-cart', emoji: '🛒', name: 'Shopping cart' },
  { id: 'basket', emoji: '🧺', name: 'Basket' },
  { id: 'broccoli', emoji: '🥦', name: 'Broccoli' },
  { id: 'avocado', emoji: '🥑', name: 'Avocado' },
  { id: 'apple', emoji: '🍎', name: 'Apple' },
  { id: 'strawberry', emoji: '🍓', name: 'Strawberry' },
  { id: 'lemon', emoji: '🍋', name: 'Lemon' },
  { id: 'bread', emoji: '🍞', name: 'Bread' },
  { id: 'cheese', emoji: '🧀', name: 'Cheese' },
  { id: 'egg', emoji: '🥚', name: 'Egg' },
  { id: 'milk', emoji: '🥛', name: 'Milk' },
  { id: 'coffee', emoji: '☕', name: 'Coffee' },
  { id: 'cooking', emoji: '🍳', name: 'Cooking' },
  { id: 'plate', emoji: '🍽️', name: 'Plate' },
  { id: 'house', emoji: '🏡', name: 'House' },
  { id: 'broom', emoji: '🧹', name: 'Broom' },
  { id: 'soap', emoji: '🧼', name: 'Soap' },
  { id: 'sponge', emoji: '🧽', name: 'Sponge' },
  { id: 'toilet-paper', emoji: '🧻', name: 'Toilet paper' },
  { id: 'bubbles', emoji: '🫧', name: 'Bubbles' },
  { id: 'bucket', emoji: '🪣', name: 'Bucket' },
  { id: 'droplet', emoji: '💧', name: 'Water drop' },
  { id: 'shower', emoji: '🚿', name: 'Shower' },
  { id: 'bed', emoji: '🛏️', name: 'Bed' },
  { id: 'wastebasket', emoji: '🗑️', name: 'Wastebasket' },
  { id: 'wrench', emoji: '🔧', name: 'Wrench' },
  { id: 'tools', emoji: '🛠️', name: 'Tools' },
  { id: 'seedling', emoji: '🌱', name: 'Sapling' },
  { id: 'potted-plant', emoji: '🪴', name: 'Potted plant' },
  { id: 'herb', emoji: '🌿', name: 'Herb' },
  { id: 'clover', emoji: '🍀', name: 'Lawn' },
  { id: 'sunflower', emoji: '🌻', name: 'Sunflower' },
  { id: 'tulip', emoji: '🌷', name: 'Tulip' },
  { id: 'blossom', emoji: '🌸', name: 'Blossom' },
  { id: 'mushroom', emoji: '🍄', name: 'Mushroom' },
  { id: 'baby', emoji: '👶', name: 'Baby' },
  { id: 'bottle', emoji: '🍼', name: 'Bottle' },
  { id: 'teddy', emoji: '🧸', name: 'Teddy' },
  { id: 'pill', emoji: '💊', name: 'Pill' },
  { id: 'tooth', emoji: '🦷', name: 'Tooth' },
  { id: 'hospital', emoji: '🏥', name: 'Hospital' },
  { id: 'gift', emoji: '🎁', name: 'Gift' },
  { id: 'party', emoji: '🎉', name: 'Party' },
  { id: 'cake', emoji: '🎂', name: 'Cake' },
  { id: 'balloon', emoji: '🎈', name: 'Balloon' },
  { id: 'books', emoji: '📚', name: 'Books' },
  { id: 'backpack', emoji: '🎒', name: 'Backpack' },
  { id: 'school', emoji: '🏫', name: 'School' },
  { id: 'laptop', emoji: '💻', name: 'Laptop' },
  { id: 'money', emoji: '💰', name: 'Money' },
  { id: 'receipt', emoji: '🧾', name: 'Receipt' },
  { id: 'car', emoji: '🚗', name: 'Car' },
  { id: 'airplane', emoji: '✈️', name: 'Airplane' },
  { id: 'luggage', emoji: '🧳', name: 'Luggage' },
  { id: 'beach', emoji: '🏖️', name: 'Beach' },
  { id: 'tent', emoji: '⛺', name: 'Tent' },
  { id: 'christmas-tree', emoji: '🎄', name: 'Christmas tree' },
  { id: 'dog', emoji: '🐶', name: 'Dog' },
  { id: 'cat', emoji: '🐱', name: 'Cat' },
  { id: 'sun', emoji: '☀️', name: 'Sun' },
  { id: 'moon', emoji: '🌙', name: 'Moon' },
  { id: 'star', emoji: '⭐', name: 'Star' },
  { id: 'sparkles', emoji: '✨', name: 'Sparkles' },
  { id: 'heart', emoji: '💚', name: 'Heart' },
  { id: 'rainbow', emoji: '🌈', name: 'Rainbow' },
  { id: 'princess', emoji: '👸', name: 'Princess' },
  { id: 'prince', emoji: '🤴', name: 'Prince' },
  { id: 'memo', emoji: '📝', name: 'Memo' },
  { id: 'check', emoji: '✅', name: 'Check' },
];

const BY_ID = new Map(ICONS.map((i) => [i.id, i]));
const PREFIX = 'icon:';

export function isIconToken(value) {
  return typeof value === 'string' && value.startsWith(PREFIX) && BY_ID.has(value.slice(PREFIX.length));
}

export function iconToken(id) {
  return `${PREFIX}${id}`;
}

export function iconId(value) {
  return isIconToken(value) ? value.slice(PREFIX.length) : null;
}

export function iconSrc(id) {
  const base = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/';
  return `${base}icons/set/${id}.svg`;
}

/** Plain-text stand-in (the matching emoji) for places that can't show an image, like the activity feed. */
export function iconToText(value) {
  const id = iconId(value);
  return id ? BY_ID.get(id).emoji : value || '';
}

export function iconName(value) {
  const id = iconId(value);
  return id ? BY_ID.get(id).name : '';
}
