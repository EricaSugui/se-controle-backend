exports.up = (pgm) => {
  pgm.addColumns('pessoas', {
    supabase_user_id: { type: 'uuid', unique: true },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('pessoas', ['supabase_user_id']);
};
