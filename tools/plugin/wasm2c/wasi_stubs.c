// WASI-imports van de wasm-gastheren (libc: printf, time en dergelijke).
// De plugin heeft geen bestanden of klok nodig: alles antwoordt ENOSYS (52).
// Eén keer per plugin, voor alle modules (gen_w2c.py). Een nieuwe import
// geeft een linkfout: dan hier toevoegen.
#include <stdint.h>

struct w2c_wasi__snapshot__preview1;
#define WASI struct w2c_wasi__snapshot__preview1*
#define ENOSYS_ 52u

uint32_t w2c_wasi__snapshot__preview1_fd_write(WASI w, uint32_t fd, uint32_t iov, uint32_t n, uint32_t written) { (void)w; (void)fd; (void)iov; (void)n; (void)written; return ENOSYS_; }
uint32_t w2c_wasi__snapshot__preview1_fd_seek(WASI w, uint32_t fd, uint64_t off, uint32_t whence, uint32_t pos) { (void)w; (void)fd; (void)off; (void)whence; (void)pos; return ENOSYS_; }
uint32_t w2c_wasi__snapshot__preview1_fd_close(WASI w, uint32_t fd) { (void)w; (void)fd; return ENOSYS_; }
uint32_t w2c_wasi__snapshot__preview1_fd_fdstat_get(WASI w, uint32_t fd, uint32_t stat) { (void)w; (void)fd; (void)stat; return ENOSYS_; }
uint32_t w2c_wasi__snapshot__preview1_clock_time_get(WASI w, uint32_t id, uint64_t precision, uint32_t time) { (void)w; (void)id; (void)precision; (void)time; return ENOSYS_; }
