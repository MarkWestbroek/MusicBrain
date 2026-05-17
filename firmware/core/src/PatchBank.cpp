#include "mb/PatchBank.h"

namespace mb {

bool PatchBank::insert(const Patch& p) {
    if (count_ >= kBankCapacity) return false;
    if (find(p.id) != nullptr)   return false;
    patches_[count_++] = p;
    return true;
}

const Patch* PatchBank::find(ProgramId id) const {
    for (std::size_t i = 0; i < count_; ++i) {
        if (patches_[i].id == id) return &patches_[i];
    }
    return nullptr;
}

const Patch* PatchBank::at(std::size_t idx) const {
    if (idx >= count_) return nullptr;
    return &patches_[idx];
}

std::size_t PatchBank::indexOf(ProgramId id) const {
    for (std::size_t i = 0; i < count_; ++i) {
        if (patches_[i].id == id) return i;
    }
    return count_;
}

bool PatchBank::setActive(ProgramId id) {
    if (find(id) == nullptr) return false;
    active_ = id;
    return true;
}

const Patch* PatchBank::active() const {
    if (!active_) return nullptr;
    return find(*active_);
}

}  // namespace mb
