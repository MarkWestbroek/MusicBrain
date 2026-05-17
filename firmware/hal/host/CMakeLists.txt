add_library(musicbrain_hal_host STATIC
    src/HostStore.cpp
    src/HostTransport.cpp
)
target_include_directories(musicbrain_hal_host PUBLIC include)
target_link_libraries(musicbrain_hal_host PUBLIC musicbrain_core)
