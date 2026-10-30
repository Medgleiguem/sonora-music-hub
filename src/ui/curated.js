// Curated YouTube searches. Each opens as a collection that can be played, saved as a playlist, or downloaded.
export const ARABIC_CLASSICS = [
  { name: 'Fairuz', arabic: 'فيروز', query: 'فيروز Fairuz أغاني' },
  { name: 'Umm Kulthum', arabic: 'أم كلثوم', query: 'أم كلثوم Umm Kulthum أغاني' },
  { name: 'Abdel Halim Hafez', arabic: 'عبد الحليم حافظ', query: 'عبد الحليم حافظ أغاني' },
  { name: 'Warda', arabic: 'وردة الجزائرية', query: 'وردة الجزائرية أغاني' },
  { name: 'Mohammed Abdel Wahab', arabic: 'محمد عبد الوهاب', query: 'محمد عبد الوهاب أغاني' },
  { name: 'Farid al-Atrash', arabic: 'فريد الأطرش', query: 'فريد الأطرش أغاني' },
  { name: 'Asmahan', arabic: 'أسمهان', query: 'أسمهان أغاني' },
  { name: 'Sabah Fakhri', arabic: 'صباح فخري', query: 'صباح فخري أغاني' },
  { name: 'Sabah', arabic: 'صباح', query: 'صباح الشحرورة أغاني' }
].map((artist) => ({ kind: 'search', id: `classic-${artist.name}`, title: artist.name, subtitle: artist.arabic, query: artist.query, arabic: artist.arabic }));

export const MOODS = [
  { title: 'Chill', query: 'chill music mix', tone: 'tone-teal' },
  { title: 'Workout', query: 'workout music hits', tone: 'tone-red' },
  { title: 'Focus', query: 'focus music instrumental', tone: 'tone-blue' },
  { title: 'Arabic pop', query: 'أغاني عربية جديدة', tone: 'tone-amber' },
  { title: 'Rap', query: 'rap hits', tone: 'tone-violet' },
  { title: 'Raï', query: 'rai music hits', tone: 'tone-orange' },
  { title: 'Sleep', query: 'sleep music calm', tone: 'tone-indigo' },
  { title: 'Party', query: 'party hits mix', tone: 'tone-pink' },
  { title: 'Quran', query: 'Quran recitation beautiful', tone: 'tone-green' },
  { title: 'Oud', query: 'oud instrumental', tone: 'tone-brown' },
  { title: 'Lo-fi', query: 'lofi hip hop', tone: 'tone-slate' },
  { title: '80s & 90s', query: '80s 90s greatest hits', tone: 'tone-rose' }
].map((mood) => ({ kind: 'search', id: `mood-${mood.title}`, ...mood }));
