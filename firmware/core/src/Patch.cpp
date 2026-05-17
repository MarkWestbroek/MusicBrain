#include "mb/Patch.h"
#include <algorithm>
#include <cstring>

namespace mb {

std::string_view Patch::nameView() const {
    auto end = std::find(name.begin(), name.end(), '\0');
    return std::string_view(name.data(), static_cast<std::size_t>(end - name.begin()));
}

void Patch::setName(std::string_view s) {
    const std::size_t n = std::min(s.size(), kPatchNameMax - 1);
    std::memcpy(name.data(), s.data(), n);
    name[n] = '\0';
}

}  // namespace mb
