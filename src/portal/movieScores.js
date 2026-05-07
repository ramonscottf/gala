const normalizeTitle = (title = '') =>
  title
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const ROTTEN_TOMATOES_OVERRIDES = {
  'how to train your dragon': {
    critics: 99,
    audience: 91,
    url: 'https://www.rottentomatoes.com/m/how_to_train_your_dragon',
  },
  'paddington 2': {
    critics: 99,
    audience: 89,
    url: 'https://www.rottentomatoes.com/m/paddington_2',
  },
  'the breadwinner': {
    critics: 95,
    audience: 88,
    url: 'https://www.rottentomatoes.com/m/the_breadwinner',
  },
  'star wars the mandalorian and grogu': {
    critics: null,
    audience: null,
    pending: true,
    url: 'https://www.rottentomatoes.com/m/the_mandalorian_and_grogu',
  },
};

export function rottenScoreFor(movie) {
  if (!movie) return null;
  const explicitCritics = movie.rtCriticsScore ?? movie.rt_critics_score;
  const explicitAudience = movie.rtAudienceScore ?? movie.rt_audience_score;
  if (explicitCritics != null || explicitAudience != null) {
    return {
      critics: explicitCritics != null ? Number(explicitCritics) : null,
      audience: explicitAudience != null ? Number(explicitAudience) : null,
      pending: false,
      url: movie.rtUrl || movie.rt_url || null,
    };
  }
  return ROTTEN_TOMATOES_OVERRIDES[normalizeTitle(movie.title || movie.movie_title)] || null;
}

export function enrichMovieScores(movie) {
  if (!movie) return movie;
  const rottenTomatoes = rottenScoreFor(movie);
  if (!rottenTomatoes) return movie;
  return {
    ...movie,
    rottenTomatoes,
    rtCriticsScore: rottenTomatoes.critics,
    rtAudienceScore: rottenTomatoes.audience,
    rtPending: rottenTomatoes.pending,
    rtUrl: rottenTomatoes.url,
  };
}

export function formatRottenBadge(movie, { audience = false } = {}) {
  const score = movie?.rottenTomatoes || rottenScoreFor(movie);
  if (!score) return '';
  if (score.pending) return 'RT pending';
  const critics = score.critics != null ? `RT ${score.critics}%` : '';
  if (!audience) return critics;
  const audienceText = score.audience != null ? `Audience ${score.audience}%` : '';
  return [critics, audienceText].filter(Boolean).join(' · ');
}
