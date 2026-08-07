/* OmniRate Configuration — see config.example.js for full setup notes.
 * Books, Music and the game catalogue work without keys.
 * Movies need TMDB. Accounts + shared ratings need Firebase (enable
 * Email/Password AND Google sign-in). RAWG is optional and adds baseline
 * ratings to games. Without Firebase everything runs in local demo mode.
 */
const CONFIG = {
  tmdb: { apiKey: 'bd18eb32acbc8488300a0c5d0df5dd83' },
  firebase: { apiKey: 'AIzaSyAGsWpvhAyUFclOooJr-vcO2xz55XD3jsI', 
             authDomain: 'omnirate-d336c.firebaseapp.com', 
             projectId: 'omnirate-d336c', 
             storageBucket: 'omnirate-d336c.firebasestorage.app', 
             messagingSenderId: '648453206033', 
             appId: '1:648453206033:web:53e4292a2baeaac55301b0' },

  // Emails allowed to view the Users directory (names + emails).
  admins: ["Aryan" + "aryan.p.shah@gmail.com"],

  // External baseline rating counts as this many community reviews.
  baselineWeight: 2,
};
