import { DatabaseSync } from 'node:sqlite';
import { SCHEMA } from './schema.js';

function utcnow() {
  return new Date().toISOString().replace('T', 'T').slice(0, 23) + 'Z';
}

function tableObj(row) {
  // node:sqlite returns null-prototype objects; return a plain copy.
  if (!row) return null;
  return { ...row };
}

export class Store {
  constructor(dbPath) {
    this.db = new DatabaseSync(dbPath);
    this.db.exec('PRAGMA foreign_keys = ON');
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA busy_timeout = 5000');
    this.db.exec(SCHEMA);
  }

  close() {
    this.db.close();
  }

  // -- vault_config -------------------------------------------------------
  getConfig() {
    return tableObj(this.db.prepare('SELECT * FROM vault_config WHERE id = 1').get());
  }

  setConfig(passwordHash, salt) {
    const now = utcnow();
    this.db.exec('BEGIN');
    try {
      this.db.prepare('DELETE FROM vault_config WHERE id = 1').run();
      this.db
        .prepare(
          'INSERT INTO vault_config (id, password_hash, salt, created_at, updated_at) VALUES (1, ?, ?, ?, ?)'
        )
        .run(passwordHash, salt, now, now);
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  // -- categories ---------------------------------------------------------
  listCategories() {
    return this.db
      .prepare(
        'SELECT c.*, (SELECT COUNT(*) FROM passwords p WHERE p.category_id = c.id) AS count FROM categories c ORDER BY c.sort_order, c.name'
      )
      .all()
      .map(tableObj);
  }

  getCategory(catId) {
    return tableObj(this.db.prepare('SELECT * FROM categories WHERE id = ?').get(catId));
  }

  createCategory(name, icon, color, sortOrder) {
    const r = this.db
      .prepare(
        'INSERT INTO categories (name, icon, color, sort_order, created_at) VALUES (?,?,?,?,?)'
      )
      .run(name, icon, color, sortOrder, utcnow());
    return Number(r.lastInsertRowid);
  }

  updateCategory(catId, name, icon, color, sortOrder) {
    const r = this.db
      .prepare('UPDATE categories SET name=?, icon=?, color=?, sort_order=? WHERE id=?')
      .run(name, icon, color, sortOrder, catId);
    r.changes;
    return r.changes > 0;
  }

  deleteCategory(catId) {
    const r = this.db.prepare('DELETE FROM categories WHERE id=?').run(catId);
    return r.changes > 0;
  }

  // -- tags ---------------------------------------------------------------
  listTags() {
    return this.db.prepare('SELECT * FROM tags ORDER BY name').all().map(tableObj);
  }

  getTag(tagId) {
    return tableObj(this.db.prepare('SELECT * FROM tags WHERE id = ?').get(tagId));
  }

  getOrCreateTag(name) {
    name = String(name).trim();
    if (!name) throw new Error('tag name is empty');
    const row = this.db.prepare('SELECT id FROM tags WHERE name = ?').get(name);
    if (row) return [Number(row.id), false];
    const r = this.db.prepare('INSERT INTO tags (name, created_at) VALUES (?, ?)').run(name, utcnow());
    return [Number(r.lastInsertRowid), true];
  }

  deleteTag(tagId) {
    const r = this.db.prepare('DELETE FROM tags WHERE id=?').run(tagId);
    return r.changes > 0;
  }

  // -- passwords ----------------------------------------------------------
  listPasswords(q = '', categoryId = null, tagId = null) {
    let sql =
      'SELECT p.*, c.name AS category_name, c.color AS category_color, c.icon AS category_icon FROM passwords p LEFT JOIN categories c ON c.id = p.category_id ';
    const where = [];
    const params = [];
    if (q) {
      where.push('(p.title LIKE ? OR p.username LIKE ? OR p.url LIKE ?)');
      const like = `%${q}%`;
      params.push(like, like, like);
    }
    if (categoryId !== null && categoryId !== undefined) {
      where.push('p.category_id = ?');
      params.push(categoryId);
    }
    if (tagId !== null && tagId !== undefined) {
      sql =
        'SELECT p.*, c.name AS category_name, c.color AS category_color, c.icon AS category_icon FROM passwords p LEFT JOIN categories c ON c.id = p.category_id JOIN password_tags pt ON pt.password_id = p.id ';
      where.push('pt.tag_id = ?');
      params.push(tagId);
    }
    if (where.length) {
      sql += ' WHERE ' + where.join(' AND ');
    }
    sql += ' ORDER BY p.favorite DESC, p.title';
    return this.db.prepare(sql).all(...params).map(tableObj);
  }

  getPassword(pwdId) {
    return tableObj(
      this.db
        .prepare(
          'SELECT p.*, c.name AS category_name, c.color AS category_color, c.icon AS category_icon FROM passwords p LEFT JOIN categories c ON c.id = p.category_id WHERE p.id = ?'
        )
        .get(pwdId)
    );
  }

  createPassword(title, username, encryptedPassword, url, notes, categoryId) {
    const now = utcnow();
    const r = this.db
      .prepare(
        'INSERT INTO passwords (title, username, encrypted_password, url, notes, category_id, favorite, created_at, updated_at) VALUES (?,?,?,?,?,?,0,?,?)'
      )
      .run(title, username, encryptedPassword, url, notes, categoryId, now, now);
    return Number(r.lastInsertRowid);
  }

  updatePassword(pwdId, title, username, encryptedPassword, url, notes, categoryId) {
    const r = this.db
      .prepare(
        'UPDATE passwords SET title=?, username=?, encrypted_password=?, url=?, notes=?, category_id=?, updated_at=? WHERE id=?'
      )
      .run(title, username, encryptedPassword, url, notes, categoryId, utcnow(), pwdId);
    return r.changes > 0;
  }

  setFavorite(pwdId, favorite) {
    const r = this.db
      .prepare('UPDATE passwords SET favorite=?, updated_at=? WHERE id=?')
      .run(favorite ? 1 : 0, utcnow(), pwdId);
    return r.changes > 0;
  }

  deletePassword(pwdId) {
    const r = this.db.prepare('DELETE FROM passwords WHERE id=?').run(pwdId);
    return r.changes > 0;
  }

  passwordTags(pwdId) {
    return this.db
      .prepare(
        'SELECT t.* FROM tags t JOIN password_tags pt ON pt.tag_id = t.id WHERE pt.password_id = ? ORDER BY t.name'
      )
      .all(pwdId)
      .map(tableObj);
  }

  setPasswordTags(pwdId, tagIds) {
    this.db.exec('BEGIN');
    try {
      this.db.prepare('DELETE FROM password_tags WHERE password_id = ?').run(pwdId);
      const ins = this.db.prepare(
        'INSERT OR IGNORE INTO password_tags (password_id, tag_id) VALUES (?, ?)'
      );
      for (const tagId of tagIds) ins.run(pwdId, tagId);
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  // -- TOTP ---------------------------------------------------------------
  listTotp() {
    return this.db.prepare('SELECT * FROM totp_entries ORDER BY name').all().map(tableObj);
  }

  getTotp(totpId) {
    return tableObj(this.db.prepare('SELECT * FROM totp_entries WHERE id = ?').get(totpId));
  }

  createTotp(name, encryptedSecret, issuer, account, period, digits, algorithm) {
    const r = this.db
      .prepare(
        'INSERT INTO totp_entries (name, encrypted_secret, issuer, account, period, digits, algorithm, created_at) VALUES (?,?,?,?,?,?,?,?)'
      )
      .run(name, encryptedSecret, issuer, account, period, digits, algorithm, utcnow());
    return Number(r.lastInsertRowid);
  }

  deleteTotp(totpId) {
    const r = this.db.prepare('DELETE FROM totp_entries WHERE id=?').run(totpId);
    return r.changes > 0;
  }

  // -- notes --------------------------------------------------------------
  listNotes(q = '') {
    const sql = q
      ? 'SELECT n.*, (SELECT COUNT(*) FROM attachments a WHERE a.note_id = n.id) AS att_count FROM notes n WHERE n.title LIKE ? ORDER BY n.updated_at DESC'
      : 'SELECT n.*, (SELECT COUNT(*) FROM attachments a WHERE a.note_id = n.id) AS att_count FROM notes n ORDER BY n.updated_at DESC';
    return this.db.prepare(sql).all(...(q ? [`%${q}%`] : [])).map(tableObj);
  }

  getNote(noteId) {
    return tableObj(this.db.prepare('SELECT * FROM notes WHERE id = ?').get(noteId));
  }

  createNote(title, encryptedContent) {
    const now = utcnow();
    const r = this.db
      .prepare('INSERT INTO notes (title, encrypted_content, created_at, updated_at) VALUES (?,?,?,?)')
      .run(title, encryptedContent, now, now);
    return Number(r.lastInsertRowid);
  }

  updateNote(noteId, title, encryptedContent) {
    const r = this.db
      .prepare('UPDATE notes SET title=?, encrypted_content=?, updated_at=? WHERE id=?')
      .run(title, encryptedContent, utcnow(), noteId);
    return r.changes > 0;
  }

  deleteNote(noteId) {
    const r = this.db.prepare('DELETE FROM notes WHERE id=?').run(noteId);
    return r.changes > 0;
  }

  // -- attachments --------------------------------------------------------
  listAttachments(noteId) {
    return this.db
      .prepare(
        'SELECT id, note_id, filename, mime_type, size, created_at FROM attachments WHERE note_id = ? ORDER BY created_at'
      )
      .all(noteId)
      .map(tableObj);
  }

  getAttachment(attId) {
    return tableObj(this.db.prepare('SELECT * FROM attachments WHERE id = ?').get(attId));
  }

  createAttachment(noteId, filename, encryptedData, mimeType, size) {
    const r = this.db
      .prepare(
        'INSERT INTO attachments (note_id, filename, encrypted_data, mime_type, size, created_at) VALUES (?,?,?,?,?,?)'
      )
      .run(noteId, filename, encryptedData, mimeType, size, utcnow());
    return Number(r.lastInsertRowid);
  }

  deleteAttachment(attId) {
    const r = this.db.prepare('DELETE FROM attachments WHERE id=?').run(attId);
    return r.changes > 0;
  }

  // -- clear / reset ------------------------------------------------------
  clearAllData() {
    const tables = [
      'password_tags',
      'passwords',
      'totp_entries',
      'attachments',
      'notes',
      'categories',
      'tags',
      'audit_log',
    ];
    this.db.exec('BEGIN');
    try {
      for (const t of tables) this.db.prepare(`DELETE FROM ${t}`).run();
      this.db
        .prepare(
          "DELETE FROM sqlite_sequence WHERE name IN ('passwords','totp_entries','notes','attachments','categories','tags','audit_log')"
        )
        .run();
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  resetVault() {
    const tables = [
      'password_tags',
      'passwords',
      'totp_entries',
      'attachments',
      'notes',
      'categories',
      'tags',
      'audit_log',
    ];
    this.db.exec('BEGIN');
    try {
      for (const t of tables) this.db.prepare(`DELETE FROM ${t}`).run();
      this.db.prepare('DELETE FROM vault_config WHERE id = 1').run();
      this.db.prepare('DELETE FROM sqlite_sequence').run();
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  // -- audit log ----------------------------------------------------------
  log(action, entityType, entityId, detail, ip) {
    try {
      this.db
        .prepare(
          'INSERT INTO audit_log (action, entity_type, entity_id, detail, ip, created_at) VALUES (?,?,?,?,?,?)'
        )
        .run(action, entityType, entityId, detail, ip, utcnow());
    } catch {
      // audit logging must never break a request
    }
  }

  listAudit(action = '', entityType = '', fromTs = '', toTs = '') {
    let sql = 'SELECT * FROM audit_log';
    const where = [];
    const params = [];
    if (action) {
      where.push('action = ?');
      params.push(action);
    }
    if (entityType) {
      where.push('entity_type = ?');
      params.push(entityType);
    }
    if (fromTs) {
      where.push('created_at >= ?');
      params.push(fromTs);
    }
    if (toTs) {
      where.push('created_at <= ?');
      params.push(toTs);
    }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY created_at DESC LIMIT 1000';
    return this.db.prepare(sql).all(...params).map(tableObj);
  }

  // -- import/export ------------------------------------------------------
  allPasswordsForExport() {
    return this.db
      .prepare(
        'SELECT p.*, c.name AS category_name FROM passwords p LEFT JOIN categories c ON c.id = p.category_id ORDER BY p.title'
      )
      .all()
      .map(tableObj);
  }
}
